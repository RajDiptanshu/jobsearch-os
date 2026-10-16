using System.IO;
using System.Text;
using System.Threading.Channels;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using InterviewAssistant.Models;
using InterviewAssistant.Services;
using Microsoft.Win32;

namespace InterviewAssistant;

public sealed class MainWindow : Window
{
    static readonly SolidColorBrush Ink=Brush("#F2F4F5"), Muted=Brush("#D4DEEB"), Accent=Brush("#A8ECD0"), BackgroundInk=Brush("#0E1520");
    readonly LocalSettings settings;
    CandidateProfile? profile;
    string? key;
    readonly TextBlock profileLabel=Label("Load your career profile",22,Ink), profileSub=Label("Your CV and stories stay local until you request an AI answer.",12,Muted);
    readonly TextBlock status=Label("Ready to prepare",13,Accent), captureStatus=Label("Capture protection pending",11,Muted), credentialStatus=Label("API setup pending",12,Muted), modeLabel=Label("YOUR NEXT ANSWER",11,Accent);
    readonly TextBox question=Input("",15), transcript=Input("",13), answer=Input("",18), sourceDetails=Input("",11);
    readonly TextBox favouriteProduct=Input("",13);
    readonly ComboBox devices=new(){MinHeight=32,DisplayMemberPath="Name"};
    readonly ComboBox audioSources=new(){MinHeight=32};
    readonly ComboBox lengths=new(){MinHeight=30};
    readonly ListBox storyList=new(){Background=Brush("#111B29"),Foreground=Ink,BorderThickness=new Thickness(0),MaxHeight=182,DisplayMemberPath="Title"};
    readonly CheckBox autoAnswer=new(){Content="Auto-answer",Foreground=Ink,VerticalAlignment=VerticalAlignment.Center,Margin=new Thickness(8,0,0,0),ToolTip="Automatically answer completed interviewer questions after a short pause. Turn off for manual answers."};
    readonly ProgressBar audioMeter=new(){Minimum=0,Maximum=1,Height=4,Background=Brush("#26354A"),Foreground=Accent,BorderThickness=new Thickness(0)};
    readonly Button listen=Button("Start listening"), generate=Button("Generate answer",true), cancel=Button("Stop answer"), rehearsal=Button("Rehearse selected story");
    readonly Grid shell=new();
    readonly StackPanel transcriptPanel=new();
    readonly Expander options=new(){Header="Options",Foreground=Muted};
    readonly AnswerDocument document=new();
    readonly TextBlock pageLabel=Label("",11,Muted);
    readonly Button previous=Button("‹"),next=Button("Next ›");
    int pageIndex;
    bool generating, updatingQuestion;
    string currentOpening="",rawAnswer="", suppliedSources="";
    readonly List<ConversationTurn> history=[];
    readonly StringBuilder committedTranscript=new();
    WindowIntegration? integration;
    IAudioCaptureSource? capture;
    RealtimeTranscriber? transcriber;
    CancellationTokenSource? listeningCts,answerCts,autoCts;
    Channel<byte[]>? audioQueue;
    Task? senderTask;
    EndOfSpeechDetector detector=new();
    bool listening,changingListening,closing;
    int answerGeneration, listeningGeneration;
    string lastQuestion="", partial="",pendingQuestion="";
    readonly bool smokeMode;
    readonly Func<AIClient> answerClientFactory;

    public MainWindow(string? profilePath=null,bool smokeMode=false,Func<AIClient>? answerClientFactory=null)
    {
        this.smokeMode=smokeMode;
        this.answerClientFactory=answerClientFactory ?? (()=>new AIClient());
        settings=smokeMode ? new LocalSettings() : LocalSettings.Load();
        Title="Interview Assistant · JobSearchOS"; Width=settings.OverlayWidth;Height=settings.OverlayHeight;MinWidth=340;MinHeight=300;
        Background=Tint(settings.OverlayTint);Foreground=Ink;FontFamily=new FontFamily("Segoe UI");WindowStartupLocation=WindowStartupLocation.CenterScreen;
        WindowStyle=WindowStyle.None;AllowsTransparency=true;ResizeMode=ResizeMode.CanResize;Topmost=true;
        BuildLayout();
        cancel.IsEnabled=false;
        SourceInitialized+=(_,_)=>InitializeWindowIntegration();
        Closed+=(_,_)=>{closing=true;answerCts?.Cancel();autoCts?.Cancel();listeningCts?.Cancel();capture?.Dispose();integration?.Dispose();if(transcriber!=null)_=transcriber.DisposeAsync();};
        Loaded+=(_,_)=>CenterNearCamera();
        SizeChanged+=(_,_)=>{settings.OverlayWidth=Width;settings.OverlayHeight=Math.Max(300,Height-(options.IsExpanded?224:0));};
        Closed+=(_,_)=>SaveSettings();
        PreviewKeyDown+=(_,e)=>{if(e.Key==Key.Escape){StopAnswer();}if(Keyboard.Modifiers==ModifierKeys.Alt&&e.Key==Key.Right){MovePage(1);e.Handled=true;}if(Keyboard.Modifiers==ModifierKeys.Alt&&e.Key==Key.Left){MovePage(-1);e.Handled=true;}};
        RefreshDevices();
        var selectedProfile=profilePath ?? Environment.GetEnvironmentVariable("INTERVIEW_ASSISTANT_PROFILE");
        if(string.IsNullOrWhiteSpace(selectedProfile))selectedProfile=settings.ProfilePath;
        if(string.IsNullOrWhiteSpace(selectedProfile))
        {
            var bundled=Path.Combine(AppContext.BaseDirectory,"private","candidate-profile.json");
            var sample=Path.Combine(AppContext.BaseDirectory,"samples","profile.example.json");
            selectedProfile=File.Exists(bundled)?bundled:sample;
        }
        if(File.Exists(selectedProfile))LoadProfile(selectedProfile!);
        var env=Environment.GetEnvironmentVariable("INTERVIEW_ASSISTANT_ENV");
        if(!string.IsNullOrWhiteSpace(env))settings.EnvFilePath=env;
        RefreshCredential();
        if(key==null&&profile!=null)SetStatus("Local rehearsal ready · API connection pending");
        autoAnswer.IsChecked=settings.AutoAnswer;
        autoAnswer.Checked+=(_,_)=>{settings.AutoAnswer=true;SaveSettings();};
        autoAnswer.Unchecked+=(_,_)=>{settings.AutoAnswer=false;autoCts?.Cancel();SaveSettings();SetStatus("Manual answers · click Generate answer when ready");};
        audioSources.ItemsSource=new[]{"Zoom desktop only","Output device (manual)"};audioSources.SelectedIndex=settings.AudioSource=="Output"?1:0;
        audioSources.SelectionChanged+=(_,_)=>{settings.AudioSource=audioSources.SelectedIndex==1?"Output":"Zoom";devices.IsEnabled=!listening&&settings.AudioSource=="Output";SaveSettings();};
        devices.IsEnabled=settings.AudioSource=="Output";
        lengths.ItemsSource=new[]{"Detailed","Balanced","Brief"};lengths.SelectedIndex=0;
        question.TextChanged+=(_,_)=>{if(!updatingQuestion)autoCts?.Cancel();};
        answer.Text="Start listening with ▶.\n\nThe question and your next spoken section appear here. Use Next or Ctrl+Alt+Right to continue.";
    }

    void BuildLayout()
    {
        var outer=new Grid();Content=outer;shell.Margin=new Thickness(15,10,15,12);outer.Children.Add(shell);
        for(var i=0;i<6;i++)shell.RowDefinitions.Add(new(){Height=i==3?new GridLength(1,GridUnitType.Star):GridLength.Auto});
        var header=new Grid{Background=Brushes.Transparent,ToolTip="Drag the top bar to move"};header.ColumnDefinitions.Add(new());header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        header.MouseLeftButtonDown+=(_,e)=>{if(e.OriginalSource is TextBlock || e.OriginalSource==header){try{DragMove();}catch(InvalidOperationException){}}};
        header.Children.Add(Label("QUESTION",10,Muted));
        var actions=new StackPanel{Orientation=Orientation.Horizontal};Grid.SetColumn(actions,1);header.Children.Add(actions);
        listen.Content="▶";listen.ToolTip="Start / pause listening · Ctrl+Alt+Space";listen.Padding=new Thickness(10,2,10,2);listen.MinHeight=24;
        listen.Click+=async(_,_)=>await ToggleListeningAsync();actions.Children.Add(listen);
        generate.Content="↻";generate.ToolTip="Answer typed / current question · Ctrl+Alt+Enter";generate.Padding=new Thickness(10,2,10,2);generate.MinHeight=24;
        generate.Click+=async(_,_)=>await AnswerAsync();actions.Children.Add(generate);
        var settingsButton=Button("•••");settingsButton.ToolTip="Expand / collapse options";settingsButton.Padding=new Thickness(9,2,9,2);settingsButton.MinHeight=24;settingsButton.Click+=(_,_)=>options.IsExpanded=!options.IsExpanded;actions.Children.Add(settingsButton);
        var close=Button("×");close.Padding=new Thickness(9,2,9,2);close.MinHeight=24;close.Margin=new Thickness(0);close.ToolTip="Close and stop everything";close.Click+=(_,_)=>Close();actions.Children.Add(close);shell.Children.Add(header);
        question.Height=52;question.FontSize=14;question.Padding=new Thickness(0,5,0,4);question.Background=Brushes.Transparent;question.BorderThickness=new Thickness(0);question.ToolTip="Live question. Edit or type, then ↻ / Ctrl+Alt+Enter for a manual answer.";
        Grid.SetRow(question,1);shell.Children.Add(question);
        var answerHeader=new Grid{Margin=new Thickness(0,4,0,4)};answerHeader.ColumnDefinitions.Add(new());answerHeader.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        modeLabel.Text="ANSWER";answerHeader.Children.Add(modeLabel);Grid.SetColumn(pageLabel,1);answerHeader.Children.Add(pageLabel);Grid.SetRow(answerHeader,2);shell.Children.Add(answerHeader);
        answer.IsReadOnly=true;answer.FontSize=settings.ReadingFontSize;answer.Background=Brushes.Transparent;answer.BorderThickness=new Thickness(0);answer.Padding=new Thickness(0,3,0,4);TextBlock.SetLineHeight(answer,settings.ReadingFontSize*1.35);answer.VerticalScrollBarVisibility=ScrollBarVisibility.Auto;
        Grid.SetRow(answer,3);shell.Children.Add(answer);
        answer.SizeChanged+=(_,_)=>ReflowReadingArea();
        var navigation=new Grid{Margin=new Thickness(0,4,0,4)};navigation.ColumnDefinitions.Add(new());navigation.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        status.FontSize=10;status.TextWrapping=TextWrapping.NoWrap;status.TextTrimming=TextTrimming.CharacterEllipsis;status.VerticalAlignment=VerticalAlignment.Center;navigation.Children.Add(status);
        var paging=new StackPanel{Orientation=Orientation.Horizontal};previous.Padding=new Thickness(9,3,9,3);previous.MinHeight=25;previous.ToolTip="Previous section · Ctrl+Alt+Left";previous.Click+=(_,_)=>MovePage(-1);paging.Children.Add(previous);
        next.Padding=new Thickness(9,3,9,3);next.MinHeight=25;next.Margin=new Thickness(0);next.ToolTip="Next section · Ctrl+Alt+Right";next.Click+=(_,_)=>MovePage(1);paging.Children.Add(next);Grid.SetColumn(paging,1);navigation.Children.Add(paging);Grid.SetRow(navigation,4);shell.Children.Add(navigation);
        previous.IsEnabled=next.IsEnabled=false;

        var detail=new StackPanel{Margin=new Thickness(0,8,0,4)};
        var scroll=new ScrollViewer{Content=detail,Height=196,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};options.Content=scroll;
        options.Expanded+=(_,_)=>{Height=Math.Min(SystemParameters.WorkArea.Height-30,Height+224);};
        options.Collapsed+=(_,_)=>{Height=Math.Max(MinHeight,Height-224);};Grid.SetRow(options,5);shell.Children.Add(options);
        var topOptions=new WrapPanel();autoAnswer.Margin=new Thickness(0,4,10,4);topOptions.Children.Add(autoAnswer);topOptions.Children.Add(lengths);
        cancel.Content="Stop answer";cancel.Click+=(_,_)=>StopAnswer();topOptions.Children.Add(cancel);detail.Children.Add(topOptions);
        detail.Children.Add(Section("READING POSITION"));var reading=new WrapPanel();
        var center=Button("Center near camera");center.Click+=(_,_)=>CenterNearCamera();reading.Children.Add(center);
        reading.Children.Add(Label("Text",11,Muted));var font=new Slider{Minimum=15,Maximum=28,Value=settings.ReadingFontSize,Width=80,Margin=new Thickness(5,3,10,3)};
        font.ValueChanged+=(_,_)=>{settings.ReadingFontSize=font.Value;answer.FontSize=font.Value;TextBlock.SetLineHeight(answer,font.Value*1.35);ReflowReadingArea();};font.PreviewMouseLeftButtonUp+=(_,_)=>SaveSettings();reading.Children.Add(font);
        reading.Children.Add(Label("Tint",11,Muted));var tint=new Slider{Minimum=.18,Maximum=.85,Value=settings.OverlayTint,Width=80,Margin=new Thickness(5,3,0,3)};
        tint.ValueChanged+=(_,_)=>{settings.OverlayTint=tint.Value;Background=Tint(tint.Value);};tint.PreviewMouseLeftButtonUp+=(_,_)=>SaveSettings();reading.Children.Add(tint);detail.Children.Add(reading);
        detail.Children.Add(Label("Drag the top bar to move. Drag any edge or the bottom-right corner to resize. Ctrl+Alt+Right / Left changes spoken sections. The current section stays in place as later ones arrive.",11,Muted));
        detail.Children.Add(Section("CASE EXAMPLE"));var favourite=favouriteProduct;favourite.Text=settings.FavouriteProduct;favourite.Height=34;favourite.AcceptsReturn=false;favourite.ToolTip="Optional product example for favourite-product cases; named products in questions take precedence.";
        favourite.TextChanged+=(_,_)=>settings.FavouriteProduct=favourite.Text.Length>80?favourite.Text[..80]:favourite.Text;favourite.LostKeyboardFocus+=(_,_)=>SaveSettings();detail.Children.Add(favourite);
        detail.Children.Add(Label("Example product only. Generated cases use explicit assumptions, not claims that you used or built that product.",11,Muted));
        detail.Children.Add(Section("MEETING AUDIO"));detail.Children.Add(audioSources);detail.Children.Add(devices);detail.Children.Add(audioMeter);
        var refresh=Button("Refresh devices");refresh.Margin=new Thickness(0,6,0,4);refresh.Click+=(_,_)=>RefreshDevices();detail.Children.Add(refresh);
        detail.Children.Add(Label("Zoom only captures Zoom playback. Use headphones. Output-device mode includes other apps. Listening sends audio to OpenAI; raw audio and transcripts are not saved.",11,Muted));
        detail.Children.Add(Label("Pause after speech (milliseconds)",11,Muted));var pause=new Slider{Minimum=400,Maximum=1200,Value=settings.EndpointSilenceMs,TickFrequency=50,IsSnapToTickEnabled=true};pause.ValueChanged+=(_,_)=>settings.EndpointSilenceMs=(int)pause.Value;pause.PreviewMouseLeftButtonUp+=(_,_)=>SaveSettings();detail.Children.Add(pause);
        detail.Children.Add(Label("Use a longer pause if an interviewer often pauses mid-question. Changes apply next time listening starts.",11,Muted));
        detail.Children.Add(Section("PROFILE & CONNECTION"));profileLabel.FontSize=16;detail.Children.Add(profileLabel);detail.Children.Add(profileSub);detail.Children.Add(credentialStatus);
        var files=new WrapPanel();var load=Button("Load profile");load.Click+=(_,_)=>ChooseProfile();files.Children.Add(load);var credentialButton=Button("API env file");credentialButton.Click+=(_,_)=>ChooseCredentials();files.Children.Add(credentialButton);detail.Children.Add(files);
        var models=new Expander{Header="Models",Foreground=Muted,Margin=new Thickness(0,8,0,0)};var modelFields=new StackPanel();
        modelFields.Children.Add(Label("Fast / experience answers",11,Muted));var fastModel=Input(settings.AnswerModel,12);fastModel.Height=32;fastModel.TextChanged+=(_,_)=>settings.AnswerModel=fastModel.Text.Trim();fastModel.LostKeyboardFocus+=(_,_)=>SaveSettings();modelFields.Children.Add(fastModel);
        modelFields.Children.Add(Label("Case reasoning",11,Muted));var caseModel=Input(settings.CaseModel,12);caseModel.Height=32;caseModel.TextChanged+=(_,_)=>settings.CaseModel=caseModel.Text.Trim();caseModel.LostKeyboardFocus+=(_,_)=>SaveSettings();modelFields.Children.Add(caseModel);models.Content=modelFields;detail.Children.Add(models);
        var stories=new Expander{Header="Saved stories / local rehearsal",Foreground=Muted,Margin=new Thickness(0,8,0,0)};var storyPanel=new StackPanel();storyList.SelectionChanged+=(_,_)=>ShowStorySource();storyPanel.Children.Add(storyList);rehearsal.Click+=(_,_)=>ShowRehearsal();storyPanel.Children.Add(rehearsal);stories.Content=storyPanel;detail.Children.Add(stories);
        transcriptPanel.Children.Add(Section("LIVE TRANSCRIPT"));transcript.IsReadOnly=true;transcript.Height=100;transcriptPanel.Children.Add(transcript);detail.Children.Add(transcriptPanel);
        detail.Children.Add(Section("SOURCES / ASSUMPTIONS"));sourceDetails.IsReadOnly=true;sourceDetails.Height=120;detail.Children.Add(sourceDetails);detail.Children.Add(captureStatus);
        var session=new WrapPanel{Margin=new Thickness(0,8,0,4)};var spoken=Button("Add Q text as what I said");spoken.Click+=(_,_)=>{if(!string.IsNullOrWhiteSpace(question.Text)){AddHistory("candidate",question.Text);SetStatus("Your spoken response added");question.Clear();}};session.Children.Add(spoken);
        var clear=Button("Clear session");clear.Click+=async(_,_)=>{await StopListeningAsync();ResetConversation();SetStatus("Session cleared · paused");};session.Children.Add(clear);detail.Children.Add(session);
        detail.Children.Add(Label("Ctrl+Alt+Space: listen/pause · Ctrl+Alt+Enter: answer · Ctrl+Alt+H: hide/show · Ctrl+Alt+S: stop answer. Hiding does not stop listening.",11,Muted));
        AddResizeHandles(outer);
    }

    void AddResizeHandles(Grid outer)
    {
        foreach(var edge in new[]{"L","R","T","B","LT","RT","LB","RB"})
        {
            var corner=edge.Length==2;var thumb=new Thumb{Width=edge.Contains('L')||edge.Contains('R')?(corner?17:7):double.NaN,Height=edge.Contains('T')||edge.Contains('B')?(corner?17:7):double.NaN,
                HorizontalAlignment=edge.Contains('L')?HorizontalAlignment.Left:edge.Contains('R')?HorizontalAlignment.Right:HorizontalAlignment.Stretch,
                VerticalAlignment=edge.Contains('T')?VerticalAlignment.Top:edge.Contains('B')?VerticalAlignment.Bottom:VerticalAlignment.Stretch,
                Cursor=corner?(edge is "LT" or "RB"?Cursors.SizeNWSE:Cursors.SizeNESW):(edge is "L" or "R"?Cursors.SizeWE:Cursors.SizeNS),ToolTip="Drag to resize"};
            if(!corner)thumb.Margin=edge is "L" or "R"?new Thickness(0,17,0,17):new Thickness(17,0,17,0);
            var template=new ControlTemplate(typeof(Thumb));var hit=new FrameworkElementFactory(typeof(Border));hit.SetValue(Border.BackgroundProperty,Brushes.Transparent);
            if(edge=="RB"){var mark=new FrameworkElementFactory(typeof(TextBlock));mark.SetValue(TextBlock.TextProperty,"◢");mark.SetValue(TextBlock.ForegroundProperty,Muted);mark.SetValue(TextBlock.FontSizeProperty,12.0);mark.SetValue(TextBlock.HorizontalAlignmentProperty,HorizontalAlignment.Right);mark.SetValue(TextBlock.VerticalAlignmentProperty,VerticalAlignment.Bottom);hit.AppendChild(mark);}
            template.VisualTree=hit;thumb.Template=template;thumb.DragDelta+=(_,e)=>ResizeFromEdge(edge,e.HorizontalChange,e.VerticalChange);thumb.DragCompleted+=(_,_)=>SaveSettings();outer.Children.Add(thumb);
        }
    }
    public void ResizeFromEdge(string edge,double dx,double dy)
    {
        if(edge.Contains('R'))Width=Math.Clamp(Width+dx,MinWidth,SystemParameters.VirtualScreenWidth);
        if(edge.Contains('B'))Height=Math.Clamp(Height+dy,MinHeight,SystemParameters.VirtualScreenHeight);
        if(edge.Contains('L')){var width=Math.Clamp(Width-dx,MinWidth,SystemParameters.VirtualScreenWidth);Left+=Width-width;Width=width;}
        if(edge.Contains('T')){var height=Math.Clamp(Height-dy,MinHeight,SystemParameters.VirtualScreenHeight);Top+=Height-height;Height=height;}
    }
    void CenterNearCamera(){var area=SystemParameters.WorkArea;Left=area.Left+(area.Width-Width)/2;Top=area.Top+12;}
    void MovePage(int direction){pageIndex=Math.Clamp(pageIndex+direction,0,Math.Max(0,document.Pages.Count-1));RenderPage();}
    void ReflowReadingArea()
    {
        if(answer.ActualWidth<50||answer.ActualHeight<40)return;
        var budget=Math.Clamp((int)((answer.ActualHeight-14)/(answer.FontSize*1.4)*(answer.ActualWidth-20)/(answer.FontSize*3.8)),12,45);
        if(budget==document.WordBudget)return;document.WordBudget=budget;
        if(rawAnswer.Length>0){document.Update(rawAnswer,currentOpening,!generating);RenderPage();}
    }
    void RenderPage()
    {
        if(document.Pages.Count==0){answer.Text=generating?"Building the first section…":"";modeLabel.Text="ANSWER";pageLabel.Text="";}
        else {pageIndex=Math.Min(pageIndex,document.Pages.Count-1);var page=document.Pages[pageIndex];modeLabel.Text=page.Title.ToUpperInvariant();pageLabel.Text=$"{pageIndex+1} / {document.Pages.Count}"+(generating?" +":"");if(answer.Text!=page.Text){answer.Text=page.Text;answer.ScrollToHome();}}
        previous.IsEnabled=pageIndex>0;next.IsEnabled=pageIndex+1<document.Pages.Count;
        sourceDetails.Text=suppliedSources+(document.Notes.Length>0?"\n\n"+document.Notes:"");
    }
    void StopAnswer(){autoCts?.Cancel();answerCts?.Cancel();generating=false;cancel.IsEnabled=false;RenderPage();SetStatus("Answer stopped");}

    void InitializeWindowIntegration()
    {
        integration=new WindowIntegration(this);integration.HotkeyPressed+=id=>Dispatcher.InvokeAsync(async()=>
        {
            if(id==1)await ToggleListeningAsync();
            if(id==2)await AnswerAsync();
            if(id==3){if(IsVisible)Hide();else{Show();Activate();}}
            if(id==4)MovePage(1);
            if(id==5)MovePage(-1);
            if(id==6)StopAnswer();
        });
        var warnings=integration.RegisterShortcuts();
        ApplyProtection();
        if(warnings.Count>0)SetStatus(string.Join(" · ",warnings));
    }

    void ApplyProtection()
    {
        var result=WindowIntegration.SetCaptureExcluded(this,true);
        captureStatus.Text=result.Success?"Capture flag ON · Zoom not verified":"Capture flag FAILED · do not rely on exclusion";
        captureStatus.Foreground=result.Success?Muted:Brush("#FFBC9A");captureStatus.ToolTip=result.Message;
    }

    void RefreshDevices()
    {
        if(listening)return;
        try{devices.ItemsSource=AudioCaptureService.GetOutputDevices();devices.SelectedIndex=0;if(devices.Items.OfType<AudioDeviceInfo>().FirstOrDefault(d=>d.Id==settings.DeviceId) is {} device)devices.SelectedItem=device;}
        catch(Exception){SetStatus("Could not enumerate output devices. Connect headphones and refresh.");}
    }

    void RefreshCredential()
    {
        try{key=CredentialResolver.ReadKey(settings.EnvFilePath);}catch(Exception){key=null;SetStatus("Could not read the selected API environment file.");}
        credentialStatus.Text=string.IsNullOrWhiteSpace(key)?"API setup pending · local rehearsal available":"Credential found · connection not yet tested";
        generate.IsEnabled=key!=null&&profile!=null;listen.IsEnabled=key!=null&&profile!=null&&!changingListening;
    }

    void ChooseCredentials()
    {
        if(listening){SetStatus("Stop listening before changing connection settings.");return;}
        var dialog=new OpenFileDialog{Title="Select your existing local API environment file",Filter="Environment or text files|*.local;*.env;*.txt|All files|*.*"};
        if(dialog.ShowDialog(this)==true){settings.EnvFilePath=dialog.FileName;SaveSettings();RefreshCredential();}
    }

    void ChooseProfile()
    {
        if(listening){SetStatus("Stop listening before changing profiles.");return;}
        var dialog=new OpenFileDialog{Title="Load your interview profile",Filter="Interview profile|*.json"};
        if(dialog.ShowDialog(this)==true)LoadProfile(dialog.FileName);
    }

    void LoadProfile(string path)
    {
        try
        {
            var next=ProfileRepository.Load(path);ResetConversation();
            profile=next;settings.ProfilePath=path;SaveSettings();profileLabel.Text=profile.Name;
            if(string.IsNullOrWhiteSpace(settings.FavouriteProduct)&&!string.IsNullOrWhiteSpace(profile.CaseExampleProduct))favouriteProduct.Text=profile.CaseExampleProduct;
            profileSub.Text=$"{profile.TargetCompany} · {profile.TargetRole}\n{profile.Stories.Count} source-labelled stories";
            storyList.ItemsSource=profile.Stories;storyList.SelectedIndex=0;RefreshCredential();SetStatus("Profile loaded · ready to rehearse");
        }
        catch(Exception){SetStatus("Profile could not be loaded. Check its JSON format and required fields.");}
    }

    void ShowStorySource()
    {
        if(storyList.SelectedItem is not ExperienceStory story)return;
        sourceDetails.Text=string.Join("\n",story.Facts.Select(f=>$"[{f.Evidence}] {f.Source}").Distinct()) + (story.Caveats.Count>0?"\n\nCheck before using:\n"+string.Join("\n",story.Caveats):"");
    }

    void ShowRehearsal()
    {
        if(storyList.SelectedItem is not ExperienceStory story)return;
        answerCts?.Cancel();autoCts?.Cancel();Interlocked.Increment(ref answerGeneration);
        generating=false;pageIndex=0;currentOpening="";suppliedSources="Local rehearsal · supplied talking points, not verified career evidence";
        rawAnswer=string.IsNullOrWhiteSpace(story.SpokenAnswer)?"This story has source facts but no prepared spoken answer. Connect the API to generate one.":story.SpokenAnswer;
        document.Update(rawAnswer,"",true);RenderPage();
        question.Text="Tell me about "+story.Title.ToLowerInvariant()+".";ShowStorySource();SetStatus("Saved profile text · no AI request made");
    }

    async Task ToggleListeningAsync()
    {
        if(changingListening)return;
        if(listening){await StopListeningAsync();return;}
        RefreshCredential();if(key==null||profile==null){SetStatus("Load a profile and connect an API credential first.");return;}
        var zoomMode=audioSources.SelectedIndex!=1;
        int? zoomPid=null;
        if(zoomMode)
        {
            try{zoomPid=ZoomProcessFinder.Find();}catch{SetStatus("Could not inspect Zoom. Open the Zoom desktop app and try again.");return;}
            if(zoomPid==null){SetStatus("Open Zoom desktop and join the meeting, then start listening. For browser Zoom, select output-device mode.");return;}
        }
        var device=devices.SelectedItem as AudioDeviceInfo;
        if(!zoomMode&&device==null){SetStatus("Choose a working output device.");return;}
        changingListening=true;listen.IsEnabled=false;SetStatus("Connecting live transcription…");listeningCts=new CancellationTokenSource();var token=listeningCts.Token;
        var sessionGeneration=Interlocked.Increment(ref listeningGeneration);
        try
        {
            transcriber=new RealtimeTranscriber(key,settings.TranscriptionModel);
            transcriber.Transcript+=(text,final)=>Dispatcher.InvokeAsync(()=>{if(sessionGeneration==listeningGeneration)OnTranscript(text,final);});
            transcriber.Status+=text=>Dispatcher.InvokeAsync(()=>{if(!closing&&sessionGeneration==listeningGeneration)SetStatus(text);});
            transcriber.Failed+=message=>Dispatcher.InvokeAsync(async()=>{if(sessionGeneration==listeningGeneration){await StopListeningAsync();SetStatus(message);}});
            await transcriber.ConnectAsync(token);
            audioQueue=Channel.CreateBounded<byte[]>(new BoundedChannelOptions(100){SingleReader=true,SingleWriter=true,FullMode=BoundedChannelFullMode.Wait});
            detector=new EndOfSpeechDetector(silenceMilliseconds:settings.EndpointSilenceMs);capture=zoomMode?new ProcessLoopbackCapture():new AudioCaptureService();
            capture.PcmAvailable+=pcm=>{if(sessionGeneration==listeningGeneration&&audioQueue!=null&&!audioQueue.Writer.TryWrite(pcm))Dispatcher.InvokeAsync(async()=>{if(sessionGeneration==listeningGeneration){await StopListeningAsync();SetStatus("Audio upload fell behind. Listening stopped; reconnect and try again.");}});};
            capture.LevelChanged+=level=>Dispatcher.InvokeAsync(()=>{if(sessionGeneration==listeningGeneration)audioMeter.Value=level;});
            capture.Failed+=message=>Dispatcher.InvokeAsync(async()=>{if(sessionGeneration==listeningGeneration){await StopListeningAsync();SetStatus(message);}});
            var activeTranscriber=transcriber;var queue=audioQueue;
            senderTask=Task.Run(async()=>
            {
                try
                {
                    long turnBytes=0;
                    await foreach(var pcm in queue.Reader.ReadAllAsync(token))
                    {
                        await activeTranscriber.AppendAudioAsync(pcm,token);
                        turnBytes+=pcm.Length;
                        var ended=detector.Push(pcm);
                        if(ended||turnBytes>=24_000*2*20)
                        {
                            // Bound buffering without transcribing long stretches of silence.
                            if(ended||detector.HasSpeech)await activeTranscriber.CommitAsync(token);
                            else await activeTranscriber.ClearAudioAsync(token);
                            turnBytes=0;detector.Reset();
                        }
                    }
                }
                catch(OperationCanceledException){}
                catch(Exception){await Dispatcher.InvokeAsync(async()=>{if(sessionGeneration==listeningGeneration){await StopListeningAsync();SetStatus("Transcription connection interrupted. Start listening to reconnect.");}});}
            },token);
            if(capture is ProcessLoopbackCapture zoomCapture)await zoomCapture.StartAsync(zoomPid!.Value,token);
            else ((AudioCaptureService)capture).Start(device!.Id);
            listening=true;if(device!=null)settings.DeviceId=device.Id;settings.AutoAnswer=autoAnswer.IsChecked==true;SaveSettings();listen.Content="Ⅱ";devices.IsEnabled=false;audioSources.IsEnabled=false;SetStatus(zoomMode?"Listening · Zoom":"Listening · output device");credentialStatus.Text="Live transcription connected";
        }
        catch(OperationCanceledException){await StopListeningAsync();SetStatus("Listening cancelled");}
        catch(Exception ex){await StopListeningAsync();SetStatus(SafeError(ex));}
        finally{changingListening=false;listen.IsEnabled=key!=null&&profile!=null;}
    }

    async Task StopListeningAsync()
    {
        Interlocked.Increment(ref listeningGeneration);listening=false;listeningCts?.Cancel();autoCts?.Cancel();answerCts?.Cancel();generating=false;cancel.IsEnabled=false;capture?.Dispose();capture=null;audioQueue?.Writer.TryComplete();audioQueue=null;
        var old=transcriber;transcriber=null;if(old!=null){try{await old.DisposeAsync();}catch{}}
        listen.Content="▶";listen.IsEnabled=key!=null&&profile!=null;devices.IsEnabled=audioSources.SelectedIndex==1;audioSources.IsEnabled=true;audioMeter.Value=0;RenderPage();partial="";pendingQuestion="";
        if(!closing)SetStatus("Listening paused");
    }

    void OnTranscript(string text,bool final)
    {
        if(closing||!listening)return;
        if(final)
        {
            partial="";if(string.IsNullOrWhiteSpace(text))return;
            committedTranscript.AppendLine(text);if(committedTranscript.Length>16000)committedTranscript.Remove(0,committedTranscript.Length-12000);
            pendingQuestion=(pendingQuestion+" "+text).Trim();if(pendingQuestion.Length>8000)pendingQuestion=text;
            lastQuestion=pendingQuestion;updatingQuestion=true;question.Text=pendingQuestion;updatingQuestion=false;AddHistory("interviewer",text);
            if(autoAnswer.IsChecked==true && GroundingService.IsLikelyQuestion(pendingQuestion))
            {
                autoCts?.Cancel();autoCts=new CancellationTokenSource();var token=autoCts.Token;
                _=AutoAnswerAfterPauseAsync(token);
            }
        }
        else{partial+=text;if(partial.Length>8000)partial=partial[^8000..];autoCts?.Cancel();updatingQuestion=true;question.Text=(pendingQuestion+" "+partial).Trim();updatingQuestion=false;SetStatus("Hearing the question…");}
        transcript.Text=committedTranscript.ToString()+partial;transcript.ScrollToEnd();
    }

    async Task AutoAnswerAfterPauseAsync(CancellationToken token)
    {
        try{await Task.Delay(250,token);if(listening&&!token.IsCancellationRequested)await AnswerAsync();}catch(OperationCanceledException){}
    }

    async Task AnswerAsync()
    {
        if(profile==null||key==null){SetStatus("Load your profile and connect an API credential first.");return;}
        var text=question.Text.Trim();if(text.Length==0)text=lastQuestion;if(text.Length==0){SetStatus("Type a question or wait for a completed transcript.");return;}
        if(text.Length>8000){SetStatus("Please shorten the question to fewer than 8,000 characters.");return;}
        pendingQuestion="";answerCts?.Cancel();answerCts=new CancellationTokenSource();var token=answerCts.Token;var generation=Interlocked.Increment(ref answerGeneration);
        if(!history.Any(x=>x.Speaker=="interviewer"&&x.Text==text))AddHistory("interviewer",text);
        var plan=AnswerFlow.Build(profile,text,history,lengths.SelectedItem?.ToString()??"Detailed",string.IsNullOrWhiteSpace(settings.FavouriteProduct)?profile.CaseExampleProduct:settings.FavouriteProduct);
        var prompt=plan.Prompt;var model=plan.Kind is QuestionKind.Experience or QuestionKind.General?settings.AnswerModel:settings.CaseModel;
        currentOpening=plan.Opening;rawAnswer="";pageIndex=0;generating=true;
        suppliedSources="Sources supplied to AI:\n"+string.Join("\n",prompt.Sources);document.Update("",currentOpening);RenderPage();
        SetStatus(currentOpening.Length>0?"Opening ready · building the next parts…":"Building your answer…");cancel.IsEnabled=true;
        var streamEnded=false;
        try
        {
            using var client=answerClientFactory();
            var completedAnswer=await client.GenerateAnswerAsync(key,model,prompt.Instructions,prompt.Input,delta=>Dispatcher.InvokeAsync(()=>
            {if(!streamEnded&&generation==answerGeneration&&!token.IsCancellationRequested){rawAnswer+=delta;document.Update(rawAnswer,currentOpening);RenderPage();}}),token);
            streamEnded=true;
            if(generation==answerGeneration){rawAnswer=completedAnswer;generating=false;document.Update(rawAnswer,currentOpening,true);RenderPage();SetStatus("Ready · Next continues");AddHistory("suggestion_not_spoken",string.Join("\n",document.Pages.Select(p=>p.Text))+"\n"+document.Notes);}
        }
        catch(OperationCanceledException){if(generation==answerGeneration)SetStatus("Answer stopped");}
        catch(Exception ex){if(generation==answerGeneration){SetStatus(SafeError(ex));if(answer.Text.Length==0)answer.Text="Could not generate an answer. Open Options for local rehearsal.";}}
        finally{streamEnded=true;if(generation==answerGeneration){generating=false;cancel.IsEnabled=false;RenderPage();}}
    }

    void AddHistory(string speaker,string text){history.Add(new(speaker,text.Length>6000?text[..6000]:text));if(history.Count>12)history.RemoveAt(0);}
    void ResetConversation()
    {
        answerCts?.Cancel();autoCts?.Cancel();Interlocked.Increment(ref answerGeneration);
        history.Clear();committedTranscript.Clear();partial="";pendingQuestion="";lastQuestion="";
        transcript.Text="Session cleared.";question.Clear();answer.Clear();cancel.IsEnabled=false;generating=false;document.Update("");pageIndex=0;currentOpening="";rawAnswer="";suppliedSources="";RenderPage();
    }
    void SaveSettings(){if(!smokeMode){try{settings.Save();}catch{SetStatus("Settings could not be saved; this session can continue.");}}}
    static string SafeError(Exception ex)
    {
        var text=ex.Message;
        if(ex is System.Net.Http.HttpRequestException {StatusCode:not null} || ex is TimeoutException)return text;
        if(ex is InvalidOperationException && (text.StartsWith("The answer ")||text.StartsWith("The connection ended")||text.StartsWith("The transcription ")||text.StartsWith("Transcription ")))return text;
        if(text.Contains("401"))return "API credential was rejected. Check the selected account and key.";
        if(text.Contains("429"))return "API quota or rate limit reached. Check billing and try later.";
        if(text.Contains("404"))return "The configured model is not available to this API project.";
        if(text.Contains("timed",StringComparison.OrdinalIgnoreCase))return "The API connection timed out. Check your network and reconnect.";
        return "Connection failed. Check network, API access, model access and billing.";
    }
    void SetStatus(string text){status.Text=text;status.ToolTip=text;}

    public void ToggleCompact()
    {
        options.IsExpanded=!options.IsExpanded;
    }

    public void PrepareSmokePreview(){ShowRehearsal();question.Text="Tell me about a product you owned end to end.";status.Text="Local rehearsal · no audio capture or API request";}
    public void PrepareCasePreview()
    {
        question.Text="What would you improve in Swiggy?";pageIndex=0;generating=false;
        currentOpening="I'd first narrow this to one user group and a clear outcome. Then I'd compare solutions and explain how I'd test the strongest option.";
        rawAnswer="[[PART: User and goal]]\nI would focus on people ordering lunch between meetings. My working assumption is that uncertainty about arrival time causes more friction than the size of the restaurant selection. I'd validate that before choosing a solution.\n[[PART: Improvement]]\nI would test a deadline-aware discovery filter, with conservative delivery windows and a clear fallback when no meal fits.\n[[NOTES]]\n[Offline hypothetical preview]";
        suppliedSources="Hypothetical case preview";document.Update(rawAnswer,currentOpening,true);RenderPage();SetStatus("Opening ready · Next continues");
    }
    public object ProbeWindowIntegration()
    {
        var initial=WindowIntegration.SetCaptureExcluded(this,true);
        Background=Tint(.18);var lightTint=WindowIntegration.SetCaptureExcluded(this,true);
        Background=Tint(.85);var darkTint=WindowIntegration.SetCaptureExcluded(this,true);Background=Tint(settings.OverlayTint);
        Hide();Show();var shown=WindowIntegration.SetCaptureExcluded(this,true);
        WindowState=WindowState.Minimized;WindowState=WindowState.Normal;var restored=WindowIntegration.SetCaptureExcluded(this,true);
        return new {Initial=initial,LightTint=lightTint,DarkTint=darkTint,AfterHideShow=shown,AfterRestore=restored,AllowsTransparency,BackgroundAlpha=((SolidColorBrush)Background).Color.A,AutoAnswerDefault=autoAnswer.IsChecked,AudioSource=audioSources.SelectedItem,Width,Height,OptionsExpanded=options.IsExpanded,ZoomReceiverVerified=false,ApiCallsMade=false};
    }
    public void SavePreview(string path)
    {
        UpdateLayout();var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(this);
        var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using var stream=File.Create(path);encoder.Save(stream);
    }
    static SolidColorBrush Brush(string hex)=>new((Color)ColorConverter.ConvertFromString(hex));
    static SolidColorBrush Tint(double strength)=>new(Color.FromArgb((byte)(Math.Clamp(strength,.18,.85)*255),14,21,32));
    static TextBlock Label(string text,double size,Brush brush)=>new(){Text=text,FontSize=size,Foreground=brush,TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,2,0,4)};
    static TextBlock Section(string text)=>new(){Text=text,FontSize=10,Foreground=Muted,FontWeight=FontWeights.SemiBold,Margin=new Thickness(0,17,0,8)};
    static TextBox Input(string text,double size)=>new(){Text=text,FontSize=size,Foreground=Ink,Background=Brush("#40111B29"),BorderBrush=Brush("#708898AD"),BorderThickness=new Thickness(1),Padding=new Thickness(10),TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,AcceptsReturn=true};
    static Button Button(string text,bool primary=false)
    {
        var button=new Button{Content=text,Foreground=primary?BackgroundInk:Ink,Background=primary?Accent:Brush("#26354A"),BorderThickness=new Thickness(0),Padding=new Thickness(12,8,12,8),Margin=new Thickness(0,0,6,0),Cursor=Cursors.Hand,FontSize=12,MinHeight=30};
        var template=new ControlTemplate(typeof(Button));var border=new FrameworkElementFactory(typeof(Border));border.SetValue(Border.CornerRadiusProperty,new CornerRadius(6));border.SetBinding(Border.BackgroundProperty,new System.Windows.Data.Binding("Background"){RelativeSource=new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent)});border.SetBinding(Border.PaddingProperty,new System.Windows.Data.Binding("Padding"){RelativeSource=new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent)});var content=new FrameworkElementFactory(typeof(ContentPresenter));content.SetValue(ContentPresenter.HorizontalAlignmentProperty,HorizontalAlignment.Center);content.SetValue(ContentPresenter.VerticalAlignmentProperty,VerticalAlignment.Center);border.AppendChild(content);template.VisualTree=border;button.Template=template;button.IsEnabledChanged+=(_,_)=>button.Opacity=button.IsEnabled?1:.4;return button;
    }
}
