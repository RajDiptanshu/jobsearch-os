using System.IO;
using System.Net.WebSockets;
using System.Text.Json;

namespace InterviewAssistant.Services;

/// <summary>
/// Realtime transcription only: mono PCM16 little-endian at 24 kHz. The caller owns VAD and
/// calls CommitAsync at the end of a speech turn. Create a fresh instance after a disconnect.
/// </summary>
public sealed class RealtimeTranscriber : IAsyncDisposable
{
    private static readonly Uri Endpoint = new("wss://api.openai.com/v1/realtime?intent=transcription");
    private const int MinimumCommitBytes = 4800; // 100 ms of 24 kHz PCM16.
    private const int MaxMessageBytes = 2_000_000;
    private readonly ClientWebSocket _socket = new();
    private readonly SemaphoreSlim _sendLock = new(1, 1);
    private readonly CancellationTokenSource _lifetime = new();
    private readonly TaskCompletionSource<bool> _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly string _model;
    private readonly Queue<string> _committedItems = new();
    private readonly HashSet<string> _queuedItems = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string?> _completedItems = new(StringComparer.Ordinal);
    private CancellationTokenSource? _sessionCancellation;
    private Task? _receiveTask;
    private long _bufferedBytes;
    private int _started;
    private int _disposed;
    private int _failureReported;

    /// <summary>Partial events contain only a delta. Final events contain one full, committed turn.</summary>
    public event Action<string, bool>? Transcript;
    public event Action<string>? Status;
    public event Action<string>? Failed;

    public RealtimeTranscriber(string apiKey, string model = "gpt-live-transcribe")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(apiKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(model);
        _model = model.Trim();
        _socket.Options.SetRequestHeader("Authorization", "Bearer " + apiKey.Trim());
        _socket.Options.KeepAliveInterval = TimeSpan.FromSeconds(20);
    }

    public async Task ConnectAsync(CancellationToken ct)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        if (Interlocked.CompareExchange(ref _started, 1, 0) != 0)
            throw new InvalidOperationException("This transcription session has already been started. Create a new session to reconnect.");
        _sessionCancellation = CancellationTokenSource.CreateLinkedTokenSource(ct, _lifetime.Token);
        var token = _sessionCancellation.Token;
        using var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        connectTimeout.CancelAfter(TimeSpan.FromSeconds(25));
        Status?.Invoke("Connecting to transcription…");
        try
        {
            await _socket.ConnectAsync(Endpoint, connectTimeout.Token).ConfigureAwait(false);
            _receiveTask = ReceiveLoopAsync(token);
            await SendJsonAsync(new
            {
                type = "session.update",
                session = new
                {
                    type = "transcription",
                    audio = new
                    {
                        input = new
                        {
                            format = new { type = "audio/pcm", rate = 24000 },
                            transcription = TranscriptionOptions(),
                            turn_detection = (object?)null
                        }
                    }
                }
            }, connectTimeout.Token).ConfigureAwait(false);
            await _ready.Task.WaitAsync(connectTimeout.Token).ConfigureAwait(false);
            Status?.Invoke("Listening · live transcription ready");
        }
        catch (OperationCanceledException) when (!token.IsCancellationRequested)
        {
            _lifetime.Cancel();
            _socket.Abort();
            throw new TimeoutException("Transcription did not become ready within 25 seconds. Check your connection and model access.");
        }
        catch
        {
            _lifetime.Cancel();
            _socket.Abort();
            throw;
        }
    }

    object TranscriptionOptions() => _model.Equals("gpt-live-transcribe", StringComparison.OrdinalIgnoreCase)
        ? new { model = _model, delay = "minimal" } : (object)new { model = _model };

    public async Task AppendAudioAsync(byte[] pcm, CancellationToken ct)
    {
        ArgumentNullException.ThrowIfNull(pcm);
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        if (pcm.Length == 0) return;
        if (pcm.Length % 2 != 0) throw new ArgumentException("PCM16 audio must contain complete two-byte samples.", nameof(pcm));
        if (pcm.Length > 48000 * 10) throw new ArgumentException("Send audio in chunks of ten seconds or less.", nameof(pcm));
        await EnsureReadyAsync(ct).ConfigureAwait(false);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _lifetime.Token);
        await _sendLock.WaitAsync(linked.Token).ConfigureAwait(false);
        try
        {
            await SendUnlockedAsync(new { type = "input_audio_buffer.append", audio = Convert.ToBase64String(pcm) }, linked.Token)
                .ConfigureAwait(false);
            _bufferedBytes += pcm.Length;
        }
        finally { _sendLock.Release(); }
    }

    public async Task CommitAsync(CancellationToken ct)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        await EnsureReadyAsync(ct).ConfigureAwait(false);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _lifetime.Token);
        await _sendLock.WaitAsync(linked.Token).ConfigureAwait(false);
        try
        {
            // Empty/double commits are rejected by the service. Keep a tiny fragment for the next turn.
            if (_bufferedBytes < MinimumCommitBytes) return;
            await SendUnlockedAsync(new { type = "input_audio_buffer.commit" }, linked.Token).ConfigureAwait(false);
            _bufferedBytes = 0;
        }
        finally { _sendLock.Release(); }
    }

    public async Task ClearAudioAsync(CancellationToken ct)
    {
        ObjectDisposedException.ThrowIf(_disposed != 0, this);
        await EnsureReadyAsync(ct).ConfigureAwait(false);
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _lifetime.Token);
        await _sendLock.WaitAsync(linked.Token).ConfigureAwait(false);
        try
        {
            await SendUnlockedAsync(new { type = "input_audio_buffer.clear" }, linked.Token).ConfigureAwait(false);
            _bufferedBytes = 0;
        }
        finally { _sendLock.Release(); }
    }

    private async Task EnsureReadyAsync(CancellationToken ct)
    {
        if (_started == 0) throw new InvalidOperationException("Connect transcription before sending audio.");
        using var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _lifetime.Token);
        await _ready.Task.WaitAsync(linked.Token).ConfigureAwait(false);
        if (_socket.State != WebSocketState.Open)
            throw new InvalidOperationException("The transcription connection is closed. Restart listening.");
    }

    private async Task SendJsonAsync(object value, CancellationToken ct)
    {
        await _sendLock.WaitAsync(ct).ConfigureAwait(false);
        try { await SendUnlockedAsync(value, ct).ConfigureAwait(false); }
        finally { _sendLock.Release(); }
    }

    private async Task SendUnlockedAsync(object value, CancellationToken ct)
    {
        if (_socket.State != WebSocketState.Open)
            throw new InvalidOperationException("The transcription connection is closed. Restart listening.");
        var bytes = JsonSerializer.SerializeToUtf8Bytes(value);
        await _socket.SendAsync(bytes.AsMemory(), WebSocketMessageType.Text, true, ct).ConfigureAwait(false);
    }

    private async Task ReceiveLoopAsync(CancellationToken ct)
    {
        var buffer = new byte[16 * 1024];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                using var message = new MemoryStream();
                ValueWebSocketReceiveResult result;
                do
                {
                    result = await _socket.ReceiveAsync(buffer.AsMemory(), ct).ConfigureAwait(false);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        ReportFailure("Transcription disconnected. Restart listening to create a new session.");
                        return;
                    }
                    if (result.MessageType != WebSocketMessageType.Text)
                        throw new InvalidOperationException("Unexpected binary transcription message.");
                    if (message.Length + result.Count > MaxMessageBytes)
                        throw new InvalidOperationException("Transcription event exceeded the permitted size.");
                    message.Write(buffer, 0, result.Count);
                } while (!result.EndOfMessage);
                using var document = JsonDocument.Parse(message.GetBuffer().AsMemory(0, checked((int)message.Length)));
                HandleEvent(document.RootElement);
            }
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { }
        catch (WebSocketException) when (ct.IsCancellationRequested || _disposed != 0) { }
        catch (Exception) when (!ct.IsCancellationRequested)
        {
            // Never expose raw service payloads, request headers or credentials in UI/log exceptions.
            ReportFailure("The transcription connection failed. Check your connection and restart listening.");
        }
        finally
        {
            _ready.TrySetCanceled();
            _lifetime.Cancel();
            _socket.Abort();
        }
    }

    private void HandleEvent(JsonElement message)
    {
        var type = StringValue(message, "type");
        switch (type)
        {
            case "session.updated":
                _ready.TrySetResult(true);
                break;
            case "input_audio_buffer.committed":
                var committedId = StringValue(message, "item_id");
                if (committedId is not null && _queuedItems.Add(committedId)) _committedItems.Enqueue(committedId);
                if (_committedItems.Count > 128)
                    throw new InvalidOperationException("Too many transcription turns are awaiting completion.");
                FlushCompletedInOrder();
                break;
            case "conversation.item.input_audio_transcription.delta":
                var delta = StringValue(message, "delta");
                if (!string.IsNullOrEmpty(delta)) Transcript?.Invoke(delta, false);
                break;
            case "conversation.item.input_audio_transcription.completed":
                CompleteItem(StringValue(message, "item_id"), StringValue(message, "transcript") ?? "");
                break;
            case "conversation.item.input_audio_transcription.failed":
                CompleteItem(StringValue(message, "item_id"), null);
                Status?.Invoke("One speech turn could not be transcribed. You can type the question.");
                break;
            case "error":
                var errorCode = message.TryGetProperty("error", out var error) ? StringValue(error, "code") : null;
                if (errorCode == "input_audio_buffer_commit_empty")
                {
                    Status?.Invoke("Waiting for speech…");
                    return;
                }
                var explanation = errorCode switch
                {
                    "invalid_api_key" => "The transcription API key was rejected. Configure a valid key locally.",
                    "insufficient_quota" or "rate_limit_exceeded" => "Transcription quota or rate limit reached. Check API billing.",
                    "invalid_model" or "model_not_found" => "The transcription model is not available to this API project. Check model access.",
                    _ => "The transcription service rejected the session. Check the model, API key and billing."
                };
                _ready.TrySetException(new InvalidOperationException(explanation));
                ReportFailure(explanation);
                _lifetime.Cancel();
                break;
        }
    }

    private void CompleteItem(string? itemId, string? transcript)
    {
        if (itemId is null)
        {
            if (!string.IsNullOrWhiteSpace(transcript)) Transcript?.Invoke(transcript, true);
            return;
        }
        _completedItems[itemId] = transcript;
        // The server emits committed events before completion. Queue by commit order, not completion order.
        if (_queuedItems.Add(itemId)) _committedItems.Enqueue(itemId);
        FlushCompletedInOrder();
    }

    private void FlushCompletedInOrder()
    {
        while (_committedItems.TryPeek(out var id) && _completedItems.Remove(id, out var transcript))
        {
            _committedItems.Dequeue();
            _queuedItems.Remove(id);
            if (!string.IsNullOrWhiteSpace(transcript)) Transcript?.Invoke(transcript, true);
        }
    }

    private void ReportFailure(string message)
    {
        if (_disposed == 0 && !_lifetime.IsCancellationRequested && Interlocked.Exchange(ref _failureReported, 1) == 0)
        {
            _ready.TrySetException(new InvalidOperationException(message));
            Failed?.Invoke(message);
        }
    }

    private static string? StringValue(JsonElement value, string property) =>
        value.ValueKind == JsonValueKind.Object && value.TryGetProperty(property, out var element) && element.ValueKind == JsonValueKind.String
            ? element.GetString() : null;

    public async ValueTask DisposeAsync()
    {
        if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
        _lifetime.Cancel();
        _ready.TrySetCanceled();
        _socket.Abort(); // Cancels pending reads/sends without waiting for a server close handshake.
        if (_receiveTask is not null)
        {
            try { await _receiveTask.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }
        // Drain a possible in-flight send before disposing its socket. Do not dispose the semaphore,
        // because a caller already waiting on it must be able to observe cancellation safely.
        await _sendLock.WaitAsync().ConfigureAwait(false);
        try { _socket.Dispose(); }
        finally { _sendLock.Release(); }
        _sessionCancellation?.Dispose();
        _lifetime.Dispose();
        _committedItems.Clear();
        _queuedItems.Clear();
        _completedItems.Clear();
    }
}
