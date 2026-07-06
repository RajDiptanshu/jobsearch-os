' Starts the JobSearchOS dashboard server hidden at logon (Startup-folder shortcut).
' Uses the absolute node path so it does not depend on PATH.
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\tansh\JoBSearchOS\jobsearch-os"
WshShell.Run "cmd /c """"C:\Program Files\nodejs\node.exe"" server.js >> data\logs\server.log 2>&1""", 0, False
