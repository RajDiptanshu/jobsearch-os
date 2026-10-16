using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace InterviewAssistant.Services;

/// <summary>Streams text from the Responses API. It never stores or logs credentials.</summary>
public sealed class AIClient : IDisposable
{
    private readonly HttpClient _http;
    // Keep the TLS connection pool warm across successive answers. Authorization belongs to each request.
    private static readonly HttpClient SharedHttp = new(new SocketsHttpHandler { PooledConnectionLifetime = TimeSpan.FromMinutes(10) }) { Timeout = Timeout.InfiniteTimeSpan };
    private const int MaxEventCharacters = 2_000_000;

    public AIClient(HttpClient? httpClient = null)
    {
        _http = httpClient ?? SharedHttp;
    }

    public async Task<string> GenerateAnswerAsync(string apiKey, string model, string instructions,
        string input, Action<string> onDelta, CancellationToken ct)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(apiKey);
        ArgumentException.ThrowIfNullOrWhiteSpace(model);
        ArgumentNullException.ThrowIfNull(onDelta);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromMinutes(2));
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey.Trim());
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/event-stream"));
        var payload = new Dictionary<string, object>
        {
            ["model"] = model.Trim(), ["instructions"] = instructions, ["input"] = input,
            ["stream"] = true, ["store"] = false, ["max_output_tokens"] = 4800
        };
        if (model.StartsWith("gpt-6", StringComparison.OrdinalIgnoreCase))
            payload["reasoning"] = new { effort = model.StartsWith("gpt-6-luna", StringComparison.OrdinalIgnoreCase) ? "none" : "low" };
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

        try
        {
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
                .ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
                throw new HttpRequestException(HttpError(response.StatusCode), null, response.StatusCode);

            await using var body = await response.Content.ReadAsStreamAsync(timeout.Token).ConfigureAwait(false);
            using var reader = new StreamReader(body, Encoding.UTF8);
            var answer = new StringBuilder();
            var eventData = new StringBuilder();
            var completed = false;

            // SSE events may contain comments, event/id fields, and multiple data lines.
            while (await reader.ReadLineAsync(timeout.Token).ConfigureAwait(false) is { } line)
            {
                if (line.Length == 0)
                {
                    if (eventData.Length == 0) continue;
                    completed = ProcessEvent(eventData.ToString(), answer, onDelta);
                    eventData.Clear();
                    if (completed) break;
                }
                else if (line.StartsWith("data:", StringComparison.Ordinal))
                {
                    var value = line.AsSpan(5);
                    if (!value.IsEmpty && value[0] == ' ') value = value[1..];
                    if (eventData.Length != 0) eventData.Append('\n');
                    eventData.Append(value);
                    if (eventData.Length > MaxEventCharacters)
                        throw new InvalidOperationException("The answer service sent an unexpectedly large event.");
                }
            }

            if (!completed && eventData.Length > 0)
                completed = ProcessEvent(eventData.ToString(), answer, onDelta);
            if (!completed)
                throw new InvalidOperationException("The connection ended before the answer was complete. Please retry.");
            if (answer.Length == 0)
                throw new InvalidOperationException("The answer service completed without returning text. Please retry.");
            return answer.ToString();
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new TimeoutException("The answer service did not finish within two minutes. Please retry.");
        }
        catch (JsonException)
        {
            throw new InvalidOperationException("The answer service returned an unreadable event. Please retry.");
        }
    }

    private static bool ProcessEvent(string data, StringBuilder answer, Action<string> onDelta)
    {
        if (data.Trim() == "[DONE]") return false; // Only response.completed confirms successful completion.
        using var document = JsonDocument.Parse(data);
        var root = document.RootElement;
        var type = GetString(root, "type");
        switch (type)
        {
            case "response.output_text.delta":
            case "response.refusal.delta":
                Append(GetString(root, "delta"), answer, onDelta);
                break;
            case "response.completed":
                if (root.TryGetProperty("response", out var result))
                {
                    var status = GetString(result, "status");
                    if (status is not null and not "completed")
                        throw new InvalidOperationException("The answer did not finish successfully. Please retry.");
                    // Recover from a successful full response if it did not contain delta events.
                    if (answer.Length == 0) Append(ReadOutput(result), answer, onDelta);
                }
                return true;
            case "response.failed":
            case "error":
                throw new InvalidOperationException("The answer service could not complete this request. Check model access and billing, then retry.");
            case "response.incomplete":
                throw new InvalidOperationException("The answer was cut short. The visible text is incomplete; retry with a shorter answer length.");
            case "response.cancelled":
                throw new InvalidOperationException("The answer service cancelled this request. Please retry.");
        }
        return false;
    }

    private static void Append(string? delta, StringBuilder answer, Action<string> onDelta)
    {
        if (string.IsNullOrEmpty(delta)) return;
        answer.Append(delta);
        onDelta(delta);
    }

    private static string ReadOutput(JsonElement response)
    {
        if (!response.TryGetProperty("output", out var output) || output.ValueKind != JsonValueKind.Array) return "";
        var text = new StringBuilder();
        foreach (var item in output.EnumerateArray())
        {
            if (!item.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array) continue;
            foreach (var part in content.EnumerateArray())
            {
                if (GetString(part, "type") == "output_text") text.Append(GetString(part, "text"));
                else if (GetString(part, "type") == "refusal") text.Append(GetString(part, "refusal"));
            }
        }
        return text.ToString();
    }

    private static string? GetString(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString() : null;

    private static string HttpError(HttpStatusCode status) => status switch
    {
        HttpStatusCode.Unauthorized => "The API key was rejected. Configure a valid key locally.",
        HttpStatusCode.Forbidden => "This API project does not have access to the requested model.",
        HttpStatusCode.TooManyRequests => "API quota or rate limit reached. Check billing and wait before retrying.",
        HttpStatusCode.BadRequest => "The API rejected the request. Check the configured answer model and its supported settings.",
        HttpStatusCode.NotFound => "The configured answer model could not be found or is not available to this API project.",
        _ => $"The answer service returned HTTP {(int)status}. Please retry."
    };

    public void Dispose()
    {
        // The default client is process-wide; an injected client is owned by its caller.
    }
}
