using System.Diagnostics;
using System.Runtime.InteropServices;
using NAudio.CoreAudioApi;
using NAudio.CoreAudioApi.Interfaces;
using NAudio.Wasapi.CoreAudioApi.Interfaces;
using NAudio.Wave;

namespace InterviewAssistant.Services;

/// <summary>Windows application loopback: only the selected process and its descendants.</summary>
public sealed class ProcessLoopbackCapture : IAudioCaptureSource
{
    readonly CancellationTokenSource stop = new();
    readonly TaskCompletionSource ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    readonly TaskCompletionSource finished = new(TaskCreationOptions.RunContinuationsAsynchronously);
    Thread? worker;
    int disposed;
    volatile bool running;
    public event Action<byte[]>? PcmAvailable;
    public event Action<float>? LevelChanged;
    public event Action<string>? Failed;
    public bool IsRunning => running;

    public async Task StartAsync(int processId, CancellationToken ct = default)
    {
        ObjectDisposedException.ThrowIf(disposed != 0, this);
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 20348))
            throw new NotSupportedException("Zoom-only audio needs Windows build 20348 or later. Choose output-device capture on older Windows.");
        if (worker != null) throw new InvalidOperationException("Create a fresh capture session to restart.");
        using (var process = Process.GetProcessById(processId))
            if (process.HasExited) throw new InvalidOperationException("The selected meeting process has closed.");
        worker = new Thread(() => CaptureLoop(processId)) { IsBackground = true, Name = "Zoom application audio" };
        worker.SetApartmentState(ApartmentState.MTA);
        worker.Start();
        try { await ready.Task.WaitAsync(TimeSpan.FromSeconds(15), ct); }
        catch { stop.Cancel(); throw; }
    }

    void CaptureLoop(int processId)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            using var signal = new AutoResetEvent(false);
            using var client = Activate(processId, stop.Token);
            var format = new WaveFormat(AudioCaptureService.SampleRate, 16, 1);
            client.Initialize(AudioClientShareMode.Shared,
                AudioClientStreamFlags.Loopback | AudioClientStreamFlags.EventCallback |
                AudioClientStreamFlags.AutoConvertPcm | AudioClientStreamFlags.SrcDefaultQuality,
                0, 0, format, Guid.Empty);
            client.SetEventHandle(signal.SafeWaitHandle.DangerousGetHandle());
            var reader = client.AudioCaptureClient;
            var buffer = new BufferedWaveProvider(format) { BufferDuration = TimeSpan.FromSeconds(1), DiscardOnBufferOverflow = false, ReadFully = true };
            var clock = Stopwatch.StartNew();
            double nextChunk = 100;
            client.Start();
            running = true;
            ready.TrySetResult();
            try
            {
                while (!stop.IsCancellationRequested)
                {
                    if (process.HasExited) throw new InvalidOperationException("Zoom closed. Open Zoom and restart listening.");
                    while (reader.GetNextPacketSize() > 0)
                    {
                        var data = reader.GetBuffer(out var frames, out var flags);
                        try
                        {
                            var bytes = new byte[checked(frames * format.BlockAlign)];
                            if ((flags & AudioClientBufferFlags.Silent) == 0 && data != 0) Marshal.Copy(data, bytes, 0, bytes.Length);
                            buffer.AddSamples(bytes, 0, bytes.Length);
                        }
                        finally { reader.ReleaseBuffer(frames); }
                    }
                    // Continuous 50 ms PCM packets keep endpointing alive during silence.
                    while (clock.Elapsed.TotalMilliseconds >= nextChunk)
                    {
                        if (clock.Elapsed.TotalMilliseconds - nextChunk > 1000) throw new InvalidOperationException("Meeting audio processing fell behind. Restart listening.");
                        var pcm = new byte[2400]; buffer.Read(pcm, 0, pcm.Length);
                        PcmAvailable?.Invoke(pcm); LevelChanged?.Invoke(PcmMath.Rms(pcm));
                        nextChunk += AudioCaptureService.ChunkMilliseconds;
                    }
                    WaitHandle.WaitAny([stop.Token.WaitHandle, signal], 10);
                }
            }
            finally { client.Stop(); }
        }
        catch (OperationCanceledException) when (stop.IsCancellationRequested) { ready.TrySetCanceled(); }
        catch (Exception ex)
        {
            var message = ex is COMException ? $"Zoom audio could not be captured (Windows error 0x{ex.HResult:X8}). Reopen Zoom and try again, or select output-device capture." : ex.Message;
            ready.TrySetException(new InvalidOperationException(message));
            if (!stop.IsCancellationRequested) Failed?.Invoke(message);
        }
        finally { running = false; LevelChanged?.Invoke(0); finished.TrySetResult(); }
    }

    static AudioClient Activate(int processId, CancellationToken ct)
    {
        var completion = new ActivationCompletion(processId);
        IActivateAudioInterfaceAsyncOperation? operation = null;
        try
        {
            var iid = typeof(IAudioClient).GUID;
            Marshal.ThrowExceptionForHR(ActivateAudioInterfaceAsync("VAD\\Process_Loopback", ref iid, completion.Variant, completion, out operation));
            var native = completion.Result.Task.WaitAsync(TimeSpan.FromSeconds(10), ct).GetAwaiter().GetResult();
            return new AudioClient(native);
        }
        catch
        {
            // An activation may complete after cancellation. Release its result in that case.
            _ = completion.Result.Task.ContinueWith(t => { if (t.IsCompletedSuccessfully) Marshal.ReleaseComObject(t.Result); }, TaskScheduler.Default);
            if (operation == null) completion.FreeParameters();
            throw;
        }
        finally { if (operation != null) Marshal.ReleaseComObject(operation); }
    }

    public void Dispose()
    {
        if (Interlocked.Exchange(ref disposed, 1) != 0) return;
        stop.Cancel();
        if (worker != null && Thread.CurrentThread != worker) worker.Join(2000);
        // The worker owns all native audio resources. It observes cancellation before releasing them.
        if (worker == null || finished.Task.IsCompleted) stop.Dispose();
        GC.SuppressFinalize(this);
    }

    [ComVisible(true), ClassInterface(ClassInterfaceType.None)]
    public sealed class ActivationCompletion : IActivateAudioInterfaceCompletionHandler, IAgileCaptureCallback
    {
        public readonly TaskCompletionSource<IAudioClient> Result = new(TaskCreationOptions.RunContinuationsAsynchronously);
        nint parameters, variant;
        public nint Variant => variant;
        internal ActivationCompletion(int processId)
        {
            parameters = Marshal.AllocHGlobal(12);
            Marshal.WriteInt32(parameters, 0, 1); // AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK
            Marshal.WriteInt32(parameters, 4, processId);
            Marshal.WriteInt32(parameters, 8, 0); // INCLUDE_TARGET_PROCESS_TREE
            variant = Marshal.AllocHGlobal(24);
            for (var i = 0; i < 24; i++) Marshal.WriteByte(variant, i, 0);
            Marshal.WriteInt16(variant, 0, 65); // VT_BLOB
            Marshal.WriteInt32(variant, 8, 12);
            Marshal.WriteIntPtr(variant, nint.Size == 8 ? 16 : 12, parameters);
        }
        public void ActivateCompleted(IActivateAudioInterfaceAsyncOperation operation)
        {
            object? native = null;
            try
            {
                operation.GetActivateResult(out var result, out native);
                Marshal.ThrowExceptionForHR(result);
                Result.TrySetResult((IAudioClient)native); native = null;
            }
            catch (Exception ex) { Result.TrySetException(ex); }
            finally { if (native != null) Marshal.ReleaseComObject(native); FreeParameters(); }
        }
        internal void FreeParameters()
        {
            var p = Interlocked.Exchange(ref parameters, 0); if (p != 0) Marshal.FreeHGlobal(p);
            var v = Interlocked.Exchange(ref variant, 0); if (v != 0) Marshal.FreeHGlobal(v);
        }
    }
    [ComVisible(true), Guid("94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IAgileCaptureCallback { }
    [DllImport("Mmdevapi.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    static extern int ActivateAudioInterfaceAsync(string deviceInterfacePath, ref Guid iid, nint activationParams,
        IActivateAudioInterfaceCompletionHandler completionHandler, out IActivateAudioInterfaceAsyncOperation operation);
}

public static class ZoomProcessFinder
{
    public static int? Find()
    {
        var processes = Process.GetProcessesByName("Zoom");
        try
        {
            var candidates = processes.Where(p => !p.HasExited).OrderBy(p => p.StartTime).ToList();
            if (candidates.Count == 0) return null;
            // Zoom's oldest desktop process owns its meeting child processes.
            return candidates[0].Id;
        }
        finally { foreach (var process in processes) process.Dispose(); }
    }
}
