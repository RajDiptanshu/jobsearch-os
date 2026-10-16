namespace InterviewAssistant.Models;

public sealed class CandidateProfile
{
    public string Name { get; set; } = "Your profile";
    public string Role { get; set; } = "";
    public string Summary { get; set; } = "";
    public string TargetCompany { get; set; } = "";
    public string TargetRole { get; set; } = "";
    public string TargetJobDescription { get; set; } = "";
    public string Language { get; set; } = "English";
    public string SpeakingStyle { get; set; } = "Natural first-person language, short sentences, concrete ownership and outcomes.";
    public string CaseExampleProduct { get; set; } = "";
    public List<ExperienceStory> Stories { get; set; } = [];
    public List<ProfileFact> Facts { get; set; } = [];
    public List<string> Cautions { get; set; } = [];
    public List<ProfileSource> Sources { get; set; } = [];
}

public sealed class ExperienceStory
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public List<string> Tags { get; set; } = [];
    public List<ProfileFact> Facts { get; set; } = [];
    public List<string> Caveats { get; set; } = [];
    public string SpokenAnswer { get; set; } = "";
}

public sealed class ProfileFact
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
    public string Source { get; set; } = "";
    // CV = CV claim; TALKING_POINT = supplied narrative; DESIGN/VERIFY = not established experience.
    public string Evidence { get; set; } = "VERIFY";
}

public sealed class ProfileSource
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Kind { get; set; } = "";
    public string LocalPath { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed record ConversationTurn(string Speaker, string Text);
