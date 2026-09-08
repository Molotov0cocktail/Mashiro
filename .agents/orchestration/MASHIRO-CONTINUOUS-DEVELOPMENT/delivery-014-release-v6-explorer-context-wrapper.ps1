$ErrorActionPreference = 'Stop'
$output = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\delivery-014-release-v6-explorer-context-02.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_ALREADY_EXISTS' }

Add-Type @'
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class MashiroExplorerContext {
  [StructLayout(LayoutKind.Sequential)] struct TOKEN_ELEVATION { public int TokenIsElevated; }
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
  [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetCurrentPackageFullName(ref uint length, StringBuilder name);
  [DllImport("user32.dll")] static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);
  [DllImport("advapi32.dll", SetLastError=true)] static extern bool GetTokenInformation(IntPtr token, int kind, IntPtr buffer, int length, out int returned);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);
  [DllImport("advapi32.dll")] static extern IntPtr GetSidSubAuthority(IntPtr sid, uint index);
  public static object Read() {
    uint shellPid; GetWindowThreadProcessId(GetShellWindow(), out shellPid);
    uint packageLength=0; int packageStatus=GetCurrentPackageFullName(ref packageLength, null); string packageName=null;
    if(packageStatus!=15700 && packageLength>0){var b=new StringBuilder((int)packageLength);packageStatus=GetCurrentPackageFullName(ref packageLength,b);if(packageStatus==0)packageName=b.ToString();}
    IntPtr token; if(!OpenProcessToken(GetCurrentProcess(),0x0008,out token))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    try {
      int size; IntPtr value=Marshal.AllocHGlobal(4);
      try {
        if(!GetTokenInformation(token,20,value,4,out size))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        bool elevated=Marshal.ReadInt32(value)!=0;
        if(!GetTokenInformation(token,18,value,4,out size))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        int elevationType=Marshal.ReadInt32(value);
        GetTokenInformation(token,25,IntPtr.Zero,0,out size); IntPtr integrity=Marshal.AllocHGlobal(size);
        try {
          if(!GetTokenInformation(token,25,integrity,size,out size))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
          TOKEN_MANDATORY_LABEL label=(TOKEN_MANDATORY_LABEL)Marshal.PtrToStructure(integrity,typeof(TOKEN_MANDATORY_LABEL));
          byte count=Marshal.ReadByte(GetSidSubAuthorityCount(label.Label.Sid)); int rid=Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid,(uint)(count-1)));
          return new { processId=Process.GetCurrentProcess().Id, shellProcessId=(int)shellPid, is64Bit=Environment.Is64BitProcess, packageStatus=packageStatus, packageName=packageName, elevated=elevated, elevationType=elevationType, integrityRid=rid };
        } finally { Marshal.FreeHGlobal(integrity); }
      } finally { Marshal.FreeHGlobal(value); }
    } finally { CloseHandle(token); }
  }
}
'@

$context = [MashiroExplorerContext]::Read()
$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$selfOwner = (Invoke-CimMethod -InputObject $self -MethodName GetOwnerSid -ErrorAction Stop).Sid
$parent = Get-CimInstance Win32_Process -Filter "ProcessId=$parentProcessId" -ErrorAction Stop
$parentOwner = (Invoke-CimMethod -InputObject $parent -MethodName GetOwnerSid -ErrorAction Stop).Sid
$clsid = '{145B11B4-27B4-4C65-8585-F689F4C2CBB9}'
$hkcuPath = "HKCU:\Software\Classes\CLSID\$clsid\LocalServer32"
$hkcrPath = "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\LocalServer32"
function Read-ExactValue([string]$Path) {
  try {
    $key = Get-Item -LiteralPath $Path -ErrorAction Stop
    [ordered]@{
      exists = $true
      value = Get-ItemPropertyValue -LiteralPath $Path -Name '(default)' -ErrorAction Stop
      valueKind = $key.GetValueKind('').ToString()
    }
  } catch {
    [ordered]@{ exists = $false; errorType = $_.Exception.GetType().FullName }
  }
}
$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperPath = $PSCommandPath
  current = $context
  parentProcessId = $parentProcessId
  parentProcessName = $parent.Name
  parentIsShellProcess = $parentProcessId -eq $context.shellProcessId -and $parent.Name -eq 'explorer.exe'
  sameUserSid = [string]::Equals($selfOwner, $parentOwner, [StringComparison]::Ordinal)
  sidValuesSaved = $false
  userProfileMatchesExpected = [string]::Equals($env:USERPROFILE, 'C:\Users\30910', [StringComparison]::OrdinalIgnoreCase)
  hkcu64 = Read-ExactValue $hkcuPath
  hkcr64 = Read-ExactValue $hkcrPath
  comInvoked = $false
  probeInvoked = $false
  registryWrites = $false
}
$json = ($report | ConvertTo-Json -Depth 8) + "`n"
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
