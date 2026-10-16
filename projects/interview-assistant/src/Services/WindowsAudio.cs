using System.Buffers.Binary;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using NAudio.Wave;

namespace InterviewAssistant.Services;

public sealed record AudioDeviceInfo(string Id, string Name);

/// <summary>
/// Captures every application playing through one Windows output endpoint, including
/// headphones. Select the same endpoint as Zoom's speaker setting. No audio is written
/// to disk. Events run on background threads; subscribers must enqueue work quickly.
/// </summary>
public sealed class AudioCaptureService : IDisposable
{
    public const int SampleRate = 24_000;
    public const int ChunkMilliseconds = 50;
    private const int ChunkBytes = SampleRate * 2 * ChunkMilliseconds / 1000;
    private readonly object _gate = new();
    private CaptureSession? _session;
    private bool _disposed;

    public event Action<byte[]>? PcmAvailable;
    public event Action<float>? LevelChanged;
    public event Action<string>? Failed;

    public bool IsRunning { get { lock (_gate) return _session is not null; } }

    public static List<AudioDeviceInfo> GetOutputDevices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var results = new List<AudioDeviceInfo>();
        foreach (var device in enumerator.EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active))
        {
            using (device) results.Add(new AudioDeviceInfo(device.ID, device.FriendlyName));
        }
        return results.OrderBy(device => device.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
    }

    public void Start(string? deviceId = null)
    {
        CaptureSession? failedSession = null;
        Exception? failure = null;
        lock (_gate)
        {
            ObjectDisposedException.ThrowIf(_disposed, this);
            if (_session is not null) return;

            var enumerator = new MMDeviceEnumerator();
            MMDevice? device = null;
            WasapiLoopbackCapture? capture = null;
            try
            {
                var useDefault = string.IsNullOrWhiteSpace(deviceId);
                device = useDefault
                    ? enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia)
                    : enumerator.GetDevice(deviceId!);
                if (device.State != DeviceState.Active)
                    throw new InvalidOperationException("The selected output device is not active.");

                // NAudio 2.2.1 enables AutoConvertPcm | SrcDefaultQuality for shared
                // loopback capture. Windows performs streaming resampling/downmixing;
                // there is no per-packet resampler reset or growing MemoryStream.
                capture = new WasapiLoopbackCapture(device)
                {
                    WaveFormat = new WaveFormat(SampleRate, 16, 1)
                };
                var session = new CaptureSession(enumerator, device, capture, useDefault);
                failedSession = session;
                session.Notifications = new EndpointNotifications(this, session);
                Marshal.ThrowExceptionForHR(enumerator.RegisterEndpointNotificationCallback(session.Notifications));
                session.NotificationRegistered = true;
                capture.DataAvailable += OnDataAvailable;
                capture.RecordingStopped += OnRecordingStopped;
                _session = session;
                capture.StartRecording();

                // A short bounded jitter buffer produces a continuous PCM clock. WASAPI
                // may emit no packets during silence; ReadFully supplies zero samples so
                // the end-of-speech detector and remote VAD can still observe the pause.
                session.Pump = new System.Threading.Timer(PumpAudio, session, 100, ChunkMilliseconds);
                failedSession = null;
            }
            catch (Exception ex)
            {
                _session = null;
                failure = ex;
                if (failedSession is null)
                {
                    capture?.Dispose();
                    device?.Dispose();
                    enumerator.Dispose();
                }
            }
        }

        failedSession?.Dispose();
        if (failure is not null)
            throw new InvalidOperationException("Could not start Windows output capture. Check the selected speaker/headphone device. " + failure.Message, failure);
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        if (e.BytesRecorded == 0) return;
        CaptureSession? session;
        try
        {
            lock (_gate)
            {
                session = _session;
                if (session is null || !ReferenceEquals(sender, session.Capture)) return;
                if (e.BytesRecorded % 2 != 0)
                    throw new InvalidOperationException("The output device supplied an incomplete PCM sample.");
                // Maximum 1 second retained. An overrun stops capture instead of losing
                // arbitrary words or accumulating an increasingly delayed transcript.
                session.Buffer.AddSamples(e.Buffer, 0, e.BytesRecorded);
            }
        }
        catch (Exception ex)
        {
            QueueFailure(sender as WasapiLoopbackCapture, "Audio buffering failed. Restart listening. " + ex.Message);
        }
    }

    private void PumpAudio(object? state)
    {
        if (state is not CaptureSession session || Interlocked.Exchange(ref session.PumpBusy, 1) != 0) return;
        try
        {
            var pcm = new byte[ChunkBytes];
            lock (_gate)
            {
                if (!ReferenceEquals(_session, session)) return;
                session.Buffer.Read(pcm, 0, pcm.Length);
            }
            PcmAvailable?.Invoke(pcm);
            LevelChanged?.Invoke(PcmMath.Rms(pcm));
        }
        catch (Exception ex)
        {
            QueueFailure(session.Capture, "The audio consumer stopped accepting data. " + ex.Message);
        }
        finally
        {
            Volatile.Write(ref session.PumpBusy, 0);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        QueueFailure(sender as WasapiLoopbackCapture,
            e.Exception is null
                ? "Windows output capture stopped. Check the output device and restart listening."
                : "Windows output capture stopped. Re-select the speaker/headphone device. " + e.Exception.Message);
    }

    private void QueueFailure(WasapiLoopbackCapture? capture, string message)
    {
        if (capture is null) return;
        // Never join/dispose the WASAPI thread from its own DataAvailable callback,
        // and never unregister notifications from a native notification callback.
        ThreadPool.QueueUserWorkItem(_ =>
        {
            CaptureSession? session;
            lock (_gate)
            {
                session = _session;
                if (session is null || !ReferenceEquals(session.Capture, capture)) return;
                _session = null;
            }
            session.Dispose();
            LevelChanged?.Invoke(0);
            Failed?.Invoke(message);
        });
    }

    public void Stop()
    {
        CaptureSession? session;
        lock (_gate)
        {
            session = _session;
            _session = null;
        }
        // Disposal joins the capture thread, which may need _gate to finish a callback.
        session?.Dispose();
        LevelChanged?.Invoke(0);
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
        }
        Stop();
        GC.SuppressFinalize(this);
    }

    private sealed class CaptureSession : IDisposable
    {
        public MMDeviceEnumerator Enumerator { get; }
        public MMDevice Device { get; }
        public WasapiLoopbackCapture Capture { get; }
        public BufferedWaveProvider Buffer { get; }
        public string DeviceId { get; }
        public bool UsesDefaultDevice { get; }
        public EndpointNotifications? Notifications { get; set; }
        public bool NotificationRegistered { get; set; }
        public System.Threading.Timer? Pump { get; set; }
        public int PumpBusy;

        public CaptureSession(MMDeviceEnumerator enumerator, MMDevice device, WasapiLoopbackCapture capture, bool usesDefaultDevice)
        {
            Enumerator = enumerator;
            Device = device;
            DeviceId = device.ID;
            Capture = capture;
            UsesDefaultDevice = usesDefaultDevice;
            Buffer = new BufferedWaveProvider(capture.WaveFormat)
            {
                BufferDuration = TimeSpan.FromSeconds(1),
                DiscardOnBufferOverflow = false,
                ReadFully = true
            };
        }

        public void Dispose()
        {
            Pump?.Dispose();
            if (NotificationRegistered && Notifications is not null)
            {
                try { Enumerator.UnregisterEndpointNotificationCallback(Notifications); }
                catch (COMException) { /* Endpoint removal may invalidate the notification source. */ }
            }
            try { Capture.Dispose(); }
            finally
            {
                Buffer.ClearBuffer();
                Device.Dispose();
                Enumerator.Dispose();
            }
        }
    }

    private sealed class EndpointNotifications(AudioCaptureService owner, CaptureSession session) : IMMNotificationClient
    {
        public void OnDeviceStateChanged(string deviceId, DeviceState newState)
        {
            if (deviceId == session.DeviceId && newState != DeviceState.Active)
                owner.QueueFailure(session.Capture, "The selected output device disconnected or became unavailable. Re-select the device and restart listening.");
        }

        public void OnDeviceRemoved(string deviceId)
        {
            if (deviceId == session.DeviceId)
                owner.QueueFailure(session.Capture, "The selected output device was removed. Re-select the device and restart listening.");
        }

        public void OnDefaultDeviceChanged(DataFlow flow, Role role, string defaultDeviceId)
        {
            if (session.UsesDefaultDevice && flow == DataFlow.Render && role == Role.Multimedia && defaultDeviceId != session.DeviceId)
                owner.QueueFailure(session.Capture, "The default Windows output device changed. Confirm Zoom's speaker setting, then restart listening.");
        }

        public void OnDeviceAdded(string deviceId) { }
        public void OnPropertyValueChanged(string deviceId, PropertyKey key) { }
    }
}

/// <summary>
/// Lightweight energy endpointing, not semantic question detection. Push ordered 24kHz
/// mono PCM16 chunks (including silence) from one consumer. Returns true once per phrase.
/// </summary>
public sealed class EndOfSpeechDetector
{
    private readonly int _silenceMilliseconds;
    private readonly int _minimumSpeechMilliseconds;
    private readonly int _maximumPhraseMilliseconds;
    private readonly float _speechThreshold;
    private double _speechMilliseconds;
    private double _quietMilliseconds;
    private double _phraseMilliseconds;

    public bool HasSpeech => _speechMilliseconds >= _minimumSpeechMilliseconds;

    public EndOfSpeechDetector(int silenceMilliseconds = 850, int minimumSpeechMilliseconds = 300,
        int maximumPhraseMilliseconds = 20_000, float speechThreshold = 0.012f)
    {
        if (silenceMilliseconds <= 0 || minimumSpeechMilliseconds <= 0 || maximumPhraseMilliseconds < minimumSpeechMilliseconds)
            throw new ArgumentOutOfRangeException(nameof(silenceMilliseconds), "Phrase timing values must be positive and maximum phrase duration must cover minimum speech.");
        if (!float.IsFinite(speechThreshold) || speechThreshold <= 0 || speechThreshold >= 1)
            throw new ArgumentOutOfRangeException(nameof(speechThreshold));
        _silenceMilliseconds = silenceMilliseconds;
        _minimumSpeechMilliseconds = minimumSpeechMilliseconds;
        _maximumPhraseMilliseconds = maximumPhraseMilliseconds;
        _speechThreshold = speechThreshold;
    }

    public bool Push(byte[] pcm)
    {
        ArgumentNullException.ThrowIfNull(pcm);
        if (pcm.Length % 2 != 0) throw new ArgumentException("PCM16 data must contain complete 2-byte samples.", nameof(pcm));
        if (pcm.Length == 0) return false;

        var milliseconds = pcm.Length * 1000d / (AudioCaptureService.SampleRate * 2);
        if (PcmMath.Rms(pcm) >= _speechThreshold)
        {
            _speechMilliseconds += milliseconds;
            _quietMilliseconds = 0;
        }
        else if (_speechMilliseconds > 0)
        {
            _quietMilliseconds += milliseconds;
        }

        if (_speechMilliseconds <= 0) return false;
        _phraseMilliseconds += milliseconds;
        if (_quietMilliseconds < _silenceMilliseconds && _phraseMilliseconds < _maximumPhraseMilliseconds) return false;
        var qualifies = _speechMilliseconds >= _minimumSpeechMilliseconds;
        Reset();
        return qualifies;
    }

    public void Reset() => (_speechMilliseconds, _quietMilliseconds, _phraseMilliseconds) = (0, 0, 0);
}

internal static class PcmMath
{
    internal static float Rms(ReadOnlySpan<byte> pcm)
    {
        if (pcm.Length < 2) return 0;
        double sum = 0;
        for (var i = 0; i + 1 < pcm.Length; i += 2)
        {
            var sample = BinaryPrimitives.ReadInt16LittleEndian(pcm.Slice(i, 2)) / 32768d;
            sum += sample * sample;
        }
        return (float)Math.Sqrt(sum / (pcm.Length / 2));
    }
}
