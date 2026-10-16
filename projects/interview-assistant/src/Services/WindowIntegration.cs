using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace InterviewAssistant.Services;

public sealed record CaptureProtectionResult(bool Success, string Message);

/// <summary>Integration for this application's own window only. All calls require its UI thread.</summary>
public sealed class WindowIntegration : IDisposable
{
    private const int WmHotkey = 0x0312;
    private const uint ModControlAltNoRepeat = 0x4003;
    private readonly Window _window;
    private readonly List<int> _registered = [];
    private HwndSource? _source;
    private nint _handle;
    private bool _disposed;

    public event Action<int>? HotkeyPressed;

    public WindowIntegration(Window window)
    {
        _window = window;
        _window.Dispatcher.VerifyAccess();
        _window.Closed += OnWindowClosed;
    }

    /// <summary>Call after SourceInitialized. Returns descriptions for shortcuts already in use.</summary>
    public List<string> RegisterShortcuts()
    {
        _window.Dispatcher.VerifyAccess();
        ObjectDisposedException.ThrowIf(_disposed, this);
        _handle = new WindowInteropHelper(_window).Handle;
        if (_handle == 0) return ["Keyboard shortcuts require an initialized window."];
        if (_source is null)
        {
            _source = HwndSource.FromHwnd(_handle);
            if (_source is null) return ["The window message source is unavailable; shortcuts were not registered."];
            _source.AddHook(WindowMessage);
        }

        var warnings = new List<string>();
        var shortcuts = new (int Id, uint Key, string Label)[]
        {
            (1, 0x20, "Ctrl+Alt+Space (listen/pause)"),
            (2, 0x0D, "Ctrl+Alt+Enter (answer)"),
            (3, 0x48, "Ctrl+Alt+H (hide/show)")
        };
        foreach (var shortcut in shortcuts)
        {
            if (_registered.Contains(shortcut.Id)) continue;
            if (RegisterHotKey(_handle, shortcut.Id, ModControlAltNoRepeat, shortcut.Key))
                _registered.Add(shortcut.Id);
            else
                warnings.Add($"{shortcut.Label} is unavailable: {new Win32Exception(Marshal.GetLastWin32Error()).Message}");
        }
        return warnings;
    }

    private nint WindowMessage(nint hwnd, int message, nint wParam, nint lParam, ref bool handled)
    {
        if (message == WmHotkey && _registered.Contains((int)wParam))
        {
            handled = true;
            HotkeyPressed?.Invoke((int)wParam);
        }
        return 0;
    }

    /// <summary>
    /// Apply after SourceInitialized, before displaying private content. Success only
    /// confirms Windows accepted/read back the flag, not Zoom or every capture method.
    /// </summary>
    public static CaptureProtectionResult SetCaptureExcluded(Window window, bool excluded)
    {
        window.Dispatcher.VerifyAccess();
        var handle = new WindowInteropHelper(window).Handle;
        if (handle == 0) return new(false, "Capture protection needs an initialized window.");
        if (excluded && !OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041))
            return new(false, "Capture exclusion requires Windows 10 version 2004 or later.");
        if (excluded && (DwmIsCompositionEnabled(out var compositionEnabled) != 0 || !compositionEnabled))
            return new(false, "Windows desktop composition is unavailable; capture exclusion could not be enabled.");

        var requested = excluded ? 0x11u : 0u;
        if (!SetWindowDisplayAffinity(handle, requested))
            return new(false, "Windows rejected capture protection: " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
        if (!GetWindowDisplayAffinity(handle, out var applied))
            return new(false, "Could not verify the Windows capture protection flag: " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
        if (applied != requested)
            return new(false, $"Windows returned a different capture protection flag (0x{applied:X}).");
        return new(true, excluded
            ? "Windows capture exclusion is enabled. Verify this Zoom sharing mode from a second device."
            : "Capture exclusion is off. This window may appear in screen sharing.");
    }

    private void OnWindowClosed(object? sender, EventArgs e) => Dispose();

    public void Dispose()
    {
        _window.Dispatcher.VerifyAccess();
        if (_disposed) return;
        _disposed = true;
        _window.Closed -= OnWindowClosed;
        foreach (var id in _registered) UnregisterHotKey(_handle, id);
        _registered.Clear();
        _source?.RemoveHook(WindowMessage);
        _source = null;
        GC.SuppressFinalize(this);
    }

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowDisplayAffinity(nint hwnd, uint affinity);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowDisplayAffinity(nint hwnd, out uint affinity);
    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmIsCompositionEnabled([MarshalAs(UnmanagedType.Bool)] out bool enabled);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool RegisterHotKey(nint hwnd, int id, uint modifiers, uint key);
    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnregisterHotKey(nint hwnd, int id);
}
