using System.IO;
using System.Text;
using System.Threading.Channels;
using System.Windows;
using System.Windows.Controls;
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
    static readonly SolidColorBrush Ink=Brush("#F2F4F5"), Muted=Brush("#A9B6C8"), Accent=Brush("#A8ECD0"), Panel=Brush("#172131"), BackgroundInk=Brush("#0E1520");
    readonly LocalSettings settings;
    CandidateProfile? profile;
    string? key;
    readonly TextBlock profileLabel=Label("Load your career profile",22,Ink), profileSub=Label("Your CV and stories stay local until you request an AI answer.",12,Muted);
    readonly TextBlock status=Label("Ready to prepare",13,Accent), captureStatus=Label("Capture protection pending",11,Muted), credentialStatus=Label("API setup pending",12,Muted), modeLabel=Label("YOUR NEXT ANSWER",11,Accent);
    readonly TextBox question=Input("",15), transcript=Input("",13), answer=Input("",18), sourceDetails=Input("",11);
    readonly ComboBox devices=new(){MinHeight=32,DisplayMemberPath="Name"};
    readonly ComboBox lengths=new(){MinHeight=30};
    readonly ListBox storyList=new(){Background=Brush("#111B29"),Foreground=Ink,BorderThickness=new Thickness(0),MaxHeight=182,DisplayMemberPath="Title"};
    readonly CheckBox autoAnswer=new(){Content="Suggest after completed questions",Foreground=Muted,Margin=new Thickness(0,12,0,4)};
    readonly ProgressBar audioMeter=new(){Minimum=0,Maximum=1,Height=4,Background=Brush("#26354A"),Foreground=Accent,BorderThickness=new Thickness(0)};
    readonly Button listen=Button("Start listening"), generate=Button("Generate answer",true), cancel=Button("Stop answer"), compactButton=Button("Floating view"), rehearsal=Button("Rehearse selected story");
    readonly Grid shell=new(){Margin=new Thickness(24)}, workspace=new();
    readonly StackPanel sidebar=new(), transcriptPanel=new();
    readonly List<ConversationTurn> history=[];
    readonly StringBuilder committedTranscript=new();
    WindowIntegration? integration;
    AudioCaptureService? capture;
    RealtimeTranscriber? transcriber;
    CancellationTokenSource? listeningCts,answerCts,autoCts;
    Channel<byte[]>? audioQueue;
    Task? senderTask;
    EndOfSpeechDetector detector=new();
    bool listening,changingListening,compact,closing;
    int answerGeneration, listeningGeneration;
    string lastQuestion="", partial="",pendingQuestion="";
    readonly bool smokeMode;

    public MainWindow(string? profilePath=null,bool smokeMode=false)
    {
        this.smokeMode=smokeMode;
        settings=smokeMode ? new LocalSettings() : LocalSettings.Load();
        Title="Interview Assistant · JobSearchOS"; Width=1080;Height=800;MinWidth=560;MinHeight=470;
        Background=BackgroundInk;Foreground=Ink;FontFamily=new FontFamily("Segoe UI");WindowStartupLocation=WindowStartupLocation.CenterScreen;
        WindowStyle=WindowStyle.None;ResizeMode=ResizeMode.CanResizeWithGrip;Topmost=true;
        BuildLayout();
        cancel.IsEnabled=false;
        SourceInitialized+=(_,_)=>InitializeWindowIntegration();
        Closed+=(_,_)=>{closing=true;answerCts?.Cancel();autoCts?.Cancel();listeningCts?.Cancel();capture?.Dispose();integration?.Dispose();if(transcriber!=null)_=transcriber.DisposeAsync();};
        PreviewKeyDown+=(_,e)=>{if(e.Key==Key.Escape){answerCts?.Cancel();SetStatus("Answer stopped");}};
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
        lengths.ItemsSource=new[]{"45–60 seconds","20–30 seconds","90 seconds"};lengths.SelectedIndex=0;
        answer.Text="A clear opening.\nA story you can stand behind.\nRoom to think.\n\nLoad your profile, select a story to rehearse, or connect the API and ask a question.";
    }

    void BuildLayout()
    {
        Content=shell;shell.RowDefinitions.Add(new(){Height=GridLength.Auto});shell.RowDefinitions.Add(new(){Height=GridLength.Auto});shell.RowDefinitions.Add(new());shell.RowDefinitions.Add(new(){Height=GridLength.Auto});
        var header=new Grid{Margin=new Thickness(0,0,0,20)};header.ColumnDefinitions.Add(new());header.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        header.MouseLeftButtonDown+=(_,e)=>{if(e.OriginalSource is TextBlock || e.OriginalSource==header){try{DragMove();}catch(InvalidOperationException){}}};
        var brand=new StackPanel();brand.Children.Add(Label("JOBSEARCH OS  /  INTERVIEW ASSISTANT",10,Muted));brand.Children.Add(Label("Stay in the conversation.",26,Ink));header.Children.Add(brand);
        var windowActions=new StackPanel{Orientation=Orientation.Horizontal,VerticalAlignment=VerticalAlignment.Top};
        compactButton.Click+=(_,_)=>ToggleCompact();windowActions.Children.Add(compactButton);
        var minimize=Button("—");minimize.ToolTip="Minimize";minimize.Click+=(_,_)=>WindowState=WindowState.Minimized;windowActions.Children.Add(minimize);
        var close=Button("×");close.ToolTip="Close and stop listening";close.Click+=(_,_)=>Close();windowActions.Children.Add(close);Grid.SetColumn(windowActions,1);header.Children.Add(windowActions);shell.Children.Add(header);
        var stateBar=new Grid{Margin=new Thickness(0,0,0,18)};stateBar.ColumnDefinitions.Add(new());stateBar.ColumnDefinitions.Add(new(){Width=GridLength.Auto});stateBar.Children.Add(status);Grid.SetColumn(captureStatus,1);stateBar.Children.Add(captureStatus);Grid.SetRow(stateBar,1);shell.Children.Add(stateBar);
        workspace.ColumnDefinitions.Add(new(){Width=new GridLength(270)});workspace.ColumnDefinitions.Add(new(){Width=new GridLength(20)});workspace.ColumnDefinitions.Add(new());Grid.SetRow(workspace,2);shell.Children.Add(workspace);
        var sideScroll=new ScrollViewer{Content=sidebar,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};workspace.Children.Add(sideScroll);
        sidebar.Children.Add(profileLabel);sidebar.Children.Add(profileSub);
        var profileButton=Button("Load profile JSON");profileButton.Margin=new Thickness(0,14,0,8);profileButton.Click+=(_,_)=>ChooseProfile();sidebar.Children.Add(profileButton);
        sidebar.Children.Add(Section("SAVED STORIES"));storyList.SelectionChanged+=(_,_)=>ShowStorySource();
        storyList.SetValue(ScrollViewer.HorizontalScrollBarVisibilityProperty,ScrollBarVisibility.Disabled);
        storyList.DisplayMemberPath="";
        var storyTemplate=new DataTemplate();var storyText=new FrameworkElementFactory(typeof(TextBlock));
        storyText.SetBinding(TextBlock.TextProperty,new System.Windows.Data.Binding("Title"));storyText.SetValue(TextBlock.TextWrappingProperty,TextWrapping.Wrap);storyText.SetValue(FrameworkElement.MarginProperty,new Thickness(4));storyTemplate.VisualTree=storyText;storyList.ItemTemplate=storyTemplate;
        sidebar.Children.Add(storyList);
        rehearsal.Margin=new Thickness(0,8,0,12);rehearsal.Click+=(_,_)=>ShowRehearsal();sidebar.Children.Add(rehearsal);
        sidebar.Children.Add(Section("MEETING AUDIO"));sidebar.Children.Add(devices);sidebar.Children.Add(audioMeter);
        var refresh=Button("Refresh audio devices");refresh.Margin=new Thickness(0,7,0,5);refresh.Click+=(_,_)=>RefreshDevices();sidebar.Children.Add(refresh);
        sidebar.Children.Add(Label("Captures all sound on this output device. Use headphones for clearer questions.",11,Muted));
        listen.Click+=async(_,_)=>await ToggleListeningAsync();sidebar.Children.Add(autoAnswer);
        sidebar.Children.Add(Label("Listening sends device audio to OpenAI. No raw audio or transcript is saved by default.",11,Muted));
        sidebar.Children.Add(Section("CONNECTION"));sidebar.Children.Add(credentialStatus);
        var credentialButton=Button("Select local API env file");credentialButton.ToolTip="Choose an existing local file containing OPENAI_API_KEY. Key values are never displayed or copied to settings.";credentialButton.Click+=(_,_)=>ChooseCredentials();sidebar.Children.Add(credentialButton);
        sidebar.Children.Add(Section("SOURCE NOTES"));sourceDetails.IsReadOnly=true;sourceDetails.MinHeight=105;sourceDetails.MaxHeight=150;sourceDetails.FontSize=11;sidebar.Children.Add(sourceDetails);
        var main=new Grid();main.RowDefinitions.Add(new(){Height=GridLength.Auto});main.RowDefinitions.Add(new(){Height=GridLength.Auto});main.RowDefinitions.Add(new());Grid.SetColumn(main,2);workspace.Children.Add(main);
        transcriptPanel.Children.Add(Section("LIVE CONVERSATION"));transcript.IsReadOnly=true;transcript.Height=86;transcript.Text="Transcription appears here after you start listening.";transcriptPanel.Children.Add(transcript);main.Children.Add(transcriptPanel);
        var askPanel=new StackPanel{Margin=new Thickness(0,18,0,16)};askPanel.Children.Add(Label("Question or follow-up",12,Muted));question.Height=62;question.AcceptsReturn=true;question.ToolTip="Type a question or edit the latest completed transcription. Ctrl+Alt+Enter generates an answer.";askPanel.Children.Add(question);
        var controls=new WrapPanel{Margin=new Thickness(0,8,0,0)};controls.Children.Add(listen);generate.Click+=async(_,_)=>await AnswerAsync();controls.Children.Add(generate);cancel.Click+=(_,_)=>{answerCts?.Cancel();SetStatus("Answer stopped");};controls.Children.Add(cancel);controls.Children.Add(lengths);
        var note=Button("Add as what I said");note.ToolTip="Adds the text above as your actual spoken response, so follow-ups can use it.";note.Click+=(_,_)=>{if(!string.IsNullOrWhiteSpace(question.Text)){AddHistory("candidate",question.Text);SetStatus("Your response was added to this session");question.Clear();}};controls.Children.Add(note);askPanel.Children.Add(controls);Grid.SetRow(askPanel,1);main.Children.Add(askPanel);
        var answerCard=new Border{Background=Panel,CornerRadius=new CornerRadius(12),Padding=new Thickness(20)};
        var answerGrid=new Grid();answerGrid.RowDefinitions.Add(new(){Height=GridLength.Auto});answerGrid.RowDefinitions.Add(new());answerGrid.Children.Add(modeLabel);
        answer.IsReadOnly=true;answer.Background=Panel;answer.BorderThickness=new Thickness(0);answer.Padding=new Thickness(0,12,0,0);answer.FontFamily=new FontFamily("Segoe UI");Grid.SetRow(answer,1);answerGrid.Children.Add(answer);answerCard.Child=answerGrid;Grid.SetRow(answerCard,2);main.Children.Add(answerCard);
        var footer=new Grid{Margin=new Thickness(0,16,0,0)};footer.ColumnDefinitions.Add(new());footer.ColumnDefinitions.Add(new(){Width=GridLength.Auto});
        footer.Children.Add(Label("Ctrl+Alt+Space  listen    ·    Ctrl+Alt+Enter  answer    ·    Ctrl+Alt+H  show / hide",10,Muted));
        var footerControls=new StackPanel{Orientation=Orientation.Horizontal};
        var clear=Button("Clear session");clear.Click+=async(_,_)=>{await StopListeningAsync();ResetConversation();SetStatus("Session cleared; listening stopped");};footerControls.Children.Add(clear);
        Grid.SetColumn(footerControls,1);footer.Children.Add(footerControls);Grid.SetRow(footer,3);shell.Children.Add(footer);
    }

    void InitializeWindowIntegration()
    {
        integration=new WindowIntegration(this);integration.HotkeyPressed+=id=>Dispatcher.InvokeAsync(async()=>
        {
            if(id==1)await ToggleListeningAsync();
            if(id==2)await AnswerAsync();
            if(id==3){if(IsVisible)Hide();else{Show();Activate();}}
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
        modeLabel.Text="LOCAL REHEARSAL · SAVED TALKING POINTS";
        answer.Text=string.IsNullOrWhiteSpace(story.SpokenAnswer)?"This story has source facts but no prepared spoken answer. Connect the API to generate one.":story.SpokenAnswer;
        question.Text="Tell me about "+story.Title.ToLowerInvariant()+".";ShowStorySource();SetStatus("Saved profile text · no AI request made");
    }

    async Task ToggleListeningAsync()
    {
        if(changingListening)return;
        if(listening){await StopListeningAsync();return;}
        RefreshCredential();if(key==null||profile==null){SetStatus("Load a profile and connect an API credential first.");return;}
        if(devices.SelectedItem is not AudioDeviceInfo device){SetStatus("Choose a working output device.");return;}
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
            detector.Reset();capture=new AudioCaptureService();
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
            capture.Start(device.Id);listening=true;settings.DeviceId=device.Id;settings.AutoAnswer=autoAnswer.IsChecked==true;SaveSettings();listen.Content="Stop listening";devices.IsEnabled=false;SetStatus("Listening to output audio · Zoom");credentialStatus.Text="Live transcription connected";
        }
        catch(OperationCanceledException){await StopListeningAsync();SetStatus("Listening cancelled");}
        catch(Exception ex){await StopListeningAsync();SetStatus(SafeError(ex));}
        finally{changingListening=false;listen.IsEnabled=key!=null&&profile!=null;}
    }

    async Task StopListeningAsync()
    {
        Interlocked.Increment(ref listeningGeneration);listening=false;listeningCts?.Cancel();autoCts?.Cancel();capture?.Dispose();capture=null;audioQueue?.Writer.TryComplete();audioQueue=null;
        var old=transcriber;transcriber=null;if(old!=null){try{await old.DisposeAsync();}catch{}}
        listen.Content="Start listening";listen.IsEnabled=key!=null&&profile!=null;devices.IsEnabled=true;audioMeter.Value=0;
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
            lastQuestion=pendingQuestion;question.Text=pendingQuestion;AddHistory("interviewer",text);
            if(autoAnswer.IsChecked==true && GroundingService.IsLikelyQuestion(pendingQuestion))
            {
                autoCts?.Cancel();autoCts=new CancellationTokenSource();var token=autoCts.Token;
                _=AutoAnswerAfterPauseAsync(token);
            }
        }
        else{partial+=text;if(partial.Length>12000)partial=partial[^12000..];autoCts?.Cancel();}
        transcript.Text=committedTranscript.ToString()+partial;transcript.ScrollToEnd();
    }

    async Task AutoAnswerAfterPauseAsync(CancellationToken token)
    {
        try{await Task.Delay(1200,token);if(listening&&!token.IsCancellationRequested)await AnswerAsync();}catch(OperationCanceledException){}
    }

    async Task AnswerAsync()
    {
        if(profile==null||key==null){SetStatus("Load your profile and connect an API credential first.");return;}
        var text=question.Text.Trim();if(text.Length==0)text=lastQuestion;if(text.Length==0){SetStatus("Type a question or wait for a completed transcript.");return;}
        if(text.Length>8000){SetStatus("Please shorten the question to fewer than 8,000 characters.");return;}
        pendingQuestion="";answerCts?.Cancel();answerCts=new CancellationTokenSource();var token=answerCts.Token;var generation=Interlocked.Increment(ref answerGeneration);
        var prompt=GroundingService.BuildPrompt(profile,text,history,lengths.SelectedItem?.ToString()??"45–60 seconds");
        modeLabel.Text="AI ANSWER · CHECK AGAINST YOUR EXPERIENCE";answer.Clear();SetStatus("Building your answer…");cancel.IsEnabled=true;
        sourceDetails.Text="Sources supplied to AI:\n"+string.Join("\n",prompt.Sources);
        try
        {
            using var client=new AIClient();
            var completedAnswer=await client.GenerateAnswerAsync(key,settings.AnswerModel,prompt.Instructions,prompt.Input,delta=>Dispatcher.InvokeAsync(()=>
            {if(generation==answerGeneration&&!token.IsCancellationRequested){answer.AppendText(delta);if(answer.VerticalOffset<1)answer.ScrollToHome();}}),token);
            if(generation==answerGeneration){answer.Text=completedAnswer;SetStatus("Answer ready · speak in your own words");AddHistory("suggestion_not_spoken",completedAnswer);}
        }
        catch(OperationCanceledException){if(generation==answerGeneration)SetStatus("Answer stopped");}
        catch(Exception ex){if(generation==answerGeneration){SetStatus(SafeError(ex));if(answer.Text.Length==0)answer.Text="The answer could not be generated. Your saved stories are available for local rehearsal.";}}
        finally{if(generation==answerGeneration)cancel.IsEnabled=false;}
    }

    void AddHistory(string speaker,string text){history.Add(new(speaker,text.Length>6000?text[..6000]:text));if(history.Count>12)history.RemoveAt(0);}
    void ResetConversation()
    {
        answerCts?.Cancel();autoCts?.Cancel();Interlocked.Increment(ref answerGeneration);
        history.Clear();committedTranscript.Clear();partial="";pendingQuestion="";lastQuestion="";
        transcript.Text="Session cleared.";question.Clear();answer.Clear();cancel.IsEnabled=false;modeLabel.Text="YOUR NEXT ANSWER";
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
    void SetStatus(string text){status.Text=text;}

    public void ToggleCompact()
    {
        compact=!compact;workspace.ColumnDefinitions[0].Width=new GridLength(compact?0:270);workspace.ColumnDefinitions[1].Width=new GridLength(compact?0:20);
        sidebar.Visibility=compact?Visibility.Collapsed:Visibility.Visible;transcriptPanel.Visibility=compact?Visibility.Collapsed:Visibility.Visible;
        Width=compact?680:1080;Height=compact?570:800;shell.Margin=new Thickness(compact?16:24);compactButton.Content=compact?"Full view":"Floating view";
    }

    public void PrepareSmokePreview(){ShowRehearsal();question.Text="Tell me about a product you owned end to end.";status.Text="Local rehearsal · no audio capture or API request";}
    public object ProbeWindowIntegration()
    {
        var initial=WindowIntegration.SetCaptureExcluded(this,true);
        Hide();Show();var shown=WindowIntegration.SetCaptureExcluded(this,true);
        WindowState=WindowState.Minimized;WindowState=WindowState.Normal;var restored=WindowIntegration.SetCaptureExcluded(this,true);
        return new {Initial=initial,AfterHideShow=shown,AfterRestore=restored,ZoomReceiverVerified=false,ApiCallsMade=false};
    }
    public void SavePreview(string path)
    {
        UpdateLayout();var bitmap=new RenderTargetBitmap((int)ActualWidth,(int)ActualHeight,96,96,PixelFormats.Pbgra32);bitmap.Render(this);
        var encoder=new PngBitmapEncoder();encoder.Frames.Add(BitmapFrame.Create(bitmap));using var stream=File.Create(path);encoder.Save(stream);
    }
    static SolidColorBrush Brush(string hex)=>new((Color)ColorConverter.ConvertFromString(hex));
    static TextBlock Label(string text,double size,Brush brush)=>new(){Text=text,FontSize=size,Foreground=brush,TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,2,0,4)};
    static TextBlock Section(string text)=>new(){Text=text,FontSize=10,Foreground=Muted,FontWeight=FontWeights.SemiBold,Margin=new Thickness(0,17,0,8)};
    static TextBox Input(string text,double size)=>new(){Text=text,FontSize=size,Foreground=Ink,Background=Brush("#111B29"),BorderBrush=Brush("#30415A"),BorderThickness=new Thickness(1),Padding=new Thickness(10),TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto,AcceptsReturn=true};
    static Button Button(string text,bool primary=false)
    {
        var button=new Button{Content=text,Foreground=primary?BackgroundInk:Ink,Background=primary?Accent:Brush("#26354A"),BorderThickness=new Thickness(0),Padding=new Thickness(12,8,12,8),Margin=new Thickness(0,0,6,0),Cursor=Cursors.Hand,FontSize=12,MinHeight=30};
        var template=new ControlTemplate(typeof(Button));var border=new FrameworkElementFactory(typeof(Border));border.SetValue(Border.CornerRadiusProperty,new CornerRadius(6));border.SetBinding(Border.BackgroundProperty,new System.Windows.Data.Binding("Background"){RelativeSource=new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent)});border.SetBinding(Border.PaddingProperty,new System.Windows.Data.Binding("Padding"){RelativeSource=new System.Windows.Data.RelativeSource(System.Windows.Data.RelativeSourceMode.TemplatedParent)});var content=new FrameworkElementFactory(typeof(ContentPresenter));content.SetValue(ContentPresenter.HorizontalAlignmentProperty,HorizontalAlignment.Center);content.SetValue(ContentPresenter.VerticalAlignmentProperty,VerticalAlignment.Center);border.AppendChild(content);template.VisualTree=border;button.Template=template;button.IsEnabledChanged+=(_,_)=>button.Opacity=button.IsEnabled?1:.4;return button;
    }
}
