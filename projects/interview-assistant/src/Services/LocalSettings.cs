using System.IO;
using System.Text.Json;
using InterviewAssistant.Models;

namespace InterviewAssistant.Services;

public sealed class LocalSettings
{
    public string ProfilePath { get; set; } = "";
    public string EnvFilePath { get; set; } = "";
    public string DeviceId { get; set; } = "";
    public string AnswerModel { get; set; } = "gpt-6.1-sol";
    public string TranscriptionModel { get; set; } = "gpt-live-transcribe";
    public bool AutoAnswer { get; set; }
    public bool CaptureExcluded { get; set; } = true;
    public static string SettingsDirectory => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "JobSearchOS.InterviewAssistant");
    public static LocalSettings Load()
    {
        try { return JsonSerializer.Deserialize<LocalSettings>(File.ReadAllText(Path.Combine(SettingsDirectory,"settings.json"))) ?? new(); }
        catch { return new(); }
    }
    public void Save()
    {
        Directory.CreateDirectory(SettingsDirectory);
        var path = Path.Combine(SettingsDirectory,"settings.json");
        File.WriteAllText(path + ".tmp", JsonSerializer.Serialize(this,new JsonSerializerOptions { WriteIndented=true }));
        File.Move(path + ".tmp",path,true);
    }
}

public static class CredentialResolver
{
    // Only reads a process environment variable or an explicitly chosen local file. Never persists or logs a key.
    public static string? ReadKey(string? envFilePath)
    {
        var fromEnvironment = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (!string.IsNullOrWhiteSpace(fromEnvironment)) return fromEnvironment.Trim();
        if (string.IsNullOrWhiteSpace(envFilePath) || !File.Exists(envFilePath)) return null;
        if (new FileInfo(envFilePath).Length > 65536) throw new InvalidDataException("The selected environment file is too large.");
        foreach (var line in File.ReadLines(envFilePath))
        {
            var trimmed=line.Trim();
            if (trimmed.StartsWith("export ",StringComparison.Ordinal)) trimmed=trimmed[7..].Trim();
            var delimiter=trimmed.IndexOf('=');
            if (delimiter<1 || trimmed[..delimiter].Trim()!="OPENAI_API_KEY") continue;
            var value=trimmed[(delimiter+1)..].Trim();
            if (value.Length>=2 && ((value[0]=='\"' && value[^1]=='\"') || (value[0]=='\'' && value[^1]=='\''))) value=value[1..^1];
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }
        return null;
    }
}

public static class ProfileRepository
{
    public static CandidateProfile Load(string path)
    {
        if (new FileInfo(path).Length > 4*1024*1024) throw new InvalidDataException("Profile exceeds the 4 MB limit.");
        var profile=JsonSerializer.Deserialize<CandidateProfile>(File.ReadAllText(path), new JsonSerializerOptions { PropertyNameCaseInsensitive=true, MaxDepth=32 })
            ?? throw new InvalidDataException("The profile is empty.");
        if (string.IsNullOrWhiteSpace(profile.Name) || profile.Facts is null || profile.Stories is null || profile.Sources is null || profile.Cautions is null)
            throw new InvalidDataException("The profile must include Name, Facts, Stories, Sources and Cautions.");
        if(profile.Stories.Any(s=>s is null || s.Facts is null || s.Tags is null || s.Caveats is null || s.Facts.Any(f=>f is null || string.IsNullOrWhiteSpace(f.Evidence))) || profile.Facts.Any(f=>f is null || string.IsNullOrWhiteSpace(f.Evidence)))
            throw new InvalidDataException("Each story needs facts, tags, caveats and evidence labels.");
        if(profile.Sources.Any(s=>s is null || string.IsNullOrWhiteSpace(s.Id)))
            throw new InvalidDataException("Each source needs an ID.");
        return profile;
    }
}
