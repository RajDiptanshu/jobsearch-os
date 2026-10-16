using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using InterviewAssistant.Services;

namespace InterviewAssistant;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        if(args.Contains("--diagnostics"))
        {
            var output=Argument(args,"--output")??Path.Combine(AppContext.BaseDirectory,"diagnostics.json");
            try{File.WriteAllText(output,JsonSerializer.Serialize(new {OperatingSystem=Environment.OSVersion.VersionString,AudioDevices=AudioCaptureService.GetOutputDevices(),ApiCallsMade=false},new JsonSerializerOptions{WriteIndented=true}));return 0;}
            catch(Exception ex){File.WriteAllText(output,JsonSerializer.Serialize(new {Error=ex.GetType().Name,ApiCallsMade=false}));return 1;}
        }
        var app=new Application{ShutdownMode=ShutdownMode.OnMainWindowClose};
        var smoke=args.Contains("--smoke-test");var window=new MainWindow(Argument(args,"--profile"),smoke);
        app.DispatcherUnhandledException+=(_,e)=>{e.Handled=true;try{Directory.CreateDirectory(LocalSettings.SettingsDirectory);File.WriteAllText(Path.Combine(LocalSettings.SettingsDirectory,"last-error.txt"),DateTimeOffset.UtcNow+" "+e.Exception.GetType().Name);if(smoke)File.WriteAllText((Argument(args,"--output")??"preview.png")+".error.txt",e.Exception.ToString());}catch{};if(smoke)app.Shutdown(1);};
        if(smoke)
        {
            window.Loaded+=async(_,_)=>
            {
                await Task.Delay(350);window.PrepareSmokePreview();
                var path=Argument(args,"--output")??Path.Combine(AppContext.BaseDirectory,"preview.png");
                window.SavePreview(path);window.ToggleCompact();await Task.Delay(250);window.SavePreview(Path.Combine(Path.GetDirectoryName(path)!,Path.GetFileNameWithoutExtension(path)+"-floating.png"));
                File.WriteAllText(Path.ChangeExtension(path,"checks.json"),JsonSerializer.Serialize(window.ProbeWindowIntegration(),new JsonSerializerOptions{WriteIndented=true}));
                app.Shutdown(0);
            };
        }
        return app.Run(window);
    }
    static string? Argument(string[] args,string name){var i=Array.IndexOf(args,name);return i>=0&&i+1<args.Length?args[i+1]:null;}
}
