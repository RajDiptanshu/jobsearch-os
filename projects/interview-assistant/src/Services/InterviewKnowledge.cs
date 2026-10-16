using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using InterviewAssistant.Models;

namespace InterviewAssistant.Services;

public sealed class PmSkill
{
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public List<string> Moves { get; set; } = [];
    public List<string> Traps { get; set; } = [];
    public List<string> Probes { get; set; } = [];
    public string VoiceExample { get; set; } = "";
    public string WorkedExample { get; set; } = "";
}
public sealed record PracticeQuestion(string Id,string Category,string Question);
public sealed class WorkedCase
{
    public string Id { get; set; } = "";
    public string Category { get; set; } = "";
    public string Title { get; set; } = "";
    public string Question { get; set; } = "";
    public List<CaseStage> Stages { get; set; } = [];
    public List<string> Rubric { get; set; } = [];
}
public sealed record CaseStage(string Question,List<string> Considerations,string Pushback);
public sealed record KnowledgeSelection(PmSkill Skill,List<PracticeQuestion> SimilarQuestions,List<WorkedCase> WorkedCases,List<PreparationNote> Preparation);

/// <summary>Local lexical retrieval. No embeddings, calls, arbitrary file discovery or document execution at runtime.</summary>
public sealed class InterviewKnowledge
{
    sealed class Bank { public List<PracticeQuestion> Questions {get;set;}=[];public List<WorkedCase> Cases {get;set;}=[]; }
    static readonly JsonSerializerOptions Json=new(){PropertyNameCaseInsensitive=true};
    static readonly Lazy<InterviewKnowledge> Bundled=new(()=>Load(Path.Combine(AppContext.BaseDirectory,"knowledge")));
    readonly List<PracticeQuestion> questions;
    readonly List<WorkedCase> cases;
    readonly Dictionary<string,PmSkill> skills;
    readonly LexicalIndex questionIndex,caseIndex;
    readonly ConditionalWeakTable<CandidateProfile,LexicalIndex> preparationIndexes=new();
    public int QuestionCount=>questions.Count;
    public int CaseCount=>cases.Count;
    public static InterviewKnowledge Default=>Bundled.Value;
    public string? SuggestCategory(string question)
    {
        var terms=LexicalIndex.Counts(question).Count;
        if(terms<3)return null;
        var worked=caseIndex.Rank(question).FirstOrDefault();
        if(worked.Matches>=3&&worked.Matches>=terms*.72)return cases[worked.Index].Category;
        var related=questionIndex.Rank(question).FirstOrDefault();
        return related.Matches>=3&&related.Matches>=terms*.8?questions[related.Index].Category:null;
    }

    InterviewKnowledge(Bank bank,List<PmSkill> skillList)
    {
        questions=bank.Questions;cases=bank.Cases;skills=skillList.ToDictionary(x=>x.Id);
        questionIndex=new(questions.Select(q=>(q.Question,q.Category)));
        caseIndex=new(cases.Select(c=>(c.Question+" "+c.Title,string.Join(" ",c.Stages.SelectMany(s=>s.Considerations)))));
    }
    public static InterviewKnowledge Load(string directory)
    {
        string Read(string name)
        {
            var path=Path.Combine(directory,name);
            if(new FileInfo(path).Length>2_000_000)throw new InvalidDataException("The interview preparation library is too large.");
            return File.ReadAllText(path);
        }
        var bank=JsonSerializer.Deserialize<Bank>(Read("pm-question-bank.json"),Json)??throw new InvalidDataException("Missing question library.");
        using var data=JsonDocument.Parse(Read("pm-skills.json"));
        var skills=JsonSerializer.Deserialize<List<PmSkill>>(data.RootElement.GetProperty("skills").GetRawText(),Json)??[];
        if(bank.Questions.Count==0||skills.Count!=9)throw new InvalidDataException("The interview preparation library is incomplete.");
        return new(bank,skills);
    }
    public KnowledgeSelection Select(CandidateProfile profile,string question,IReadOnlyList<ConversationTurn> history,QuestionKind kind)
    {
        var category=kind switch
        {
            QuestionKind.Product=>"design",QuestionKind.Diagnosis=>"problem",QuestionKind.Estimate=>"estimation",
            QuestionKind.Strategy=>"strategy",QuestionKind.Metrics=>"metrics",QuestionKind.Technical=>"technical",
            QuestionKind.Experience when Regex.IsMatch(question,@"\b(yourself|why.*(company|join|role|switch)|looking for|leaving|strength|weakness)\b",RegexOptions.IgnoreCase)=>"hr",
            QuestionKind.Experience when Regex.IsMatch(question,@"\b(end.to.end|most technical|deep dive|shipped|owned|architecture|implementation)\b",RegexOptions.IgnoreCase)=>"hiring-manager",
            QuestionKind.Experience=>"behavioral",
            QuestionKind.General when Regex.IsMatch(question,@"\b(why (this (company|role)|join|switch)|great pm|good pm|strength|weakness)\b",RegexOptions.IgnoreCase) ||
                (!string.IsNullOrWhiteSpace(profile.TargetCompany)&&question.StartsWith("Why",StringComparison.OrdinalIgnoreCase)&&question.Contains(profile.TargetCompany.Split(' ')[0],StringComparison.OrdinalIgnoreCase))=>"hr",
            _=>"technical"
        };
        var prior=string.Join(" ",history.Where(t=>t.Speaker is "interviewer" or "candidate").Where(t=>t.Text!=question).TakeLast(2).Select(t=>Limit(t.Text,500)));
        var query=question+" "+question+" "+prior;
        var nearby=questionIndex.Rank(query).Where(x=>questions[x.Index].Category==category).Take(3).Select(x=>questions[x.Index]).ToList();
        var worked=caseIndex.Rank(query).Where(x=>cases[x.Index].Category==category&&x.Matches>=2).Take(1).Select(x=>cases[x.Index]).ToList();
        var notes=profile.PreparationNotes??[];
        var index=preparationIndexes.GetValue(profile,p=>new LexicalIndex((p.PreparationNotes??[]).Select(n=>(n.Title,n.Text))));
        var personal=kind is QuestionKind.Experience or QuestionKind.General;
        var targetWord=profile.TargetCompany.Split(' ',StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        var platform=Regex.IsMatch(query,@"\b(connector|pipeline|schema|cdc|checkpoint|idempoten|oauth|webhook|sql|database|warehouse|backfill|distributed|api|kafka|rag|llm)",RegexOptions.IgnoreCase) ||
            (!string.IsNullOrWhiteSpace(targetWord)&&query.Contains(targetWord,StringComparison.OrdinalIgnoreCase));
        var ranked=personal||platform?index.Rank(query).Where(x=>x.Matches>=1&&(personal||notes[x.Index].Kind is "REFERENCE" or "DESIGN" or "PUBLIC_REFERENCE")).ToList():[];
        if(ranked.Count>0)ranked=ranked.Where(x=>x.Score>=ranked[0].Score*.45).ToList();
        var selected=new List<PreparationNote>();var budget=0;
        foreach(var item in ranked)
        {
            var note=notes[item.Index];var max=kind==QuestionKind.Experience?2200:3000;
            var text=Limit(note.Text,max);if(budget+text.Length>7500)continue;
            selected.Add(new(){Id=note.Id,Title=note.Title,Kind=note.Kind,Source=note.Source,Text=text});budget+=text.Length;
            if(selected.Count==4)break;
        }
        return new(skills[category],nearby,worked,selected);
    }
    static string Limit(string value,int limit)=>value.Length<=limit?value:value[..limit]+"…";

    sealed class LexicalIndex
    {
        readonly List<(Dictionary<string,int> Title,Dictionary<string,int> Body)> rows;
        readonly Dictionary<string,int> frequency=new();
        public LexicalIndex(IEnumerable<(string Title,string Body)> documents)
        {
            rows=documents.Select(d=>(Counts(d.Title),Counts(d.Body))).ToList();
            foreach(var row in rows)foreach(var term in row.Item1.Keys.Union(row.Item2.Keys))frequency[term]=frequency.GetValueOrDefault(term)+1;
        }
        public IEnumerable<(int Index,double Score,int Matches)> Rank(string query)
        {
            var terms=Counts(query);return rows.Select((row,i)=>
            {
                double score=0;var matches=0;
                foreach(var (term,weight) in terms)
                {
                    var title=row.Title.GetValueOrDefault(term);var body=row.Body.GetValueOrDefault(term);if(title+body==0)continue;
                    matches++;var idf=Math.Log(1+(rows.Count-frequency.GetValueOrDefault(term)+.5)/(frequency.GetValueOrDefault(term)+.5));
                    score+=Math.Min(weight,3)*idf*(title>0?3.5:0)+Math.Min(weight,3)*idf*body/(body+1.2+.002*row.Body.Values.Sum());
                }
                return(Index:i,Score:score,Matches:matches);
            }).Where(x=>x.Score>0).OrderByDescending(x=>x.Score).ThenBy(x=>x.Index);
        }
        static readonly HashSet<string> Stop="the and for your you with that this what how when where why was were are did does have has had can could would about from tell please which there their they into will our my then need product question answer first example me one also".Split(' ').ToHashSet();
        internal static Dictionary<string,int> Counts(string value)
        {
            var result=new Dictionary<string,int>();
            foreach(Match m in Regex.Matches(value.ToLowerInvariant(),@"[\p{L}\p{N}]+"))
            {
                var t=m.Value;if(t.Length<3||Stop.Contains(t))continue;
                t=t switch{"stale" or "staleness"=>"freshness","synced" or "syncing" or "synchronization"=>"sync","recovery" or "recoverable" or "recovered"=>"recover","retries"=>"retry","favourite"=>"favorite",_=>t};
                if(t.Length>4&&t.EndsWith('s'))t=t[..^1];result[t]=result.GetValueOrDefault(t)+1;
            }
            return result;
        }
    }
}
