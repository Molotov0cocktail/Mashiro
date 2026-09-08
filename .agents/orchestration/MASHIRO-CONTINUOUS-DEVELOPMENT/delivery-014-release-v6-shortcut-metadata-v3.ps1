$ErrorActionPreference = 'Stop'

$shortcutPath =
  'C:\Users\30910\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Mashiro.lnk'
$expectedExecutable =
  'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'

if (-not (Test-Path -LiteralPath $shortcutPath -PathType Leaf)) {
  throw 'MASHIRO_SHORTCUT_NOT_FOUND'
}

Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class MashiroShortcutProperties {
  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey {
    public Guid formatId;
    public uint propertyId;
    public PropertyKey(Guid formatId, uint propertyId) {
      this.formatId = formatId;
      this.propertyId = propertyId;
    }
  }

  [StructLayout(LayoutKind.Explicit, Size = 24)]
  public struct PropVariant {
    [FieldOffset(0)] public ushort valueType;
    [FieldOffset(8)] public IntPtr pointerValue;
  }

  [ComImport]
  [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IPropertyStore {
    [PreserveSig] int GetCount(out uint propertyCount);
    [PreserveSig] int GetAt(uint propertyIndex, out PropertyKey key);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
    [PreserveSig] int Commit();
  }

  [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
  private static extern int SHGetPropertyStoreFromParsingName(
    string path,
    IntPtr bindingContext,
    uint flags,
    ref Guid interfaceId,
    [MarshalAs(UnmanagedType.Interface)] out IPropertyStore propertyStore
  );

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern int PropVariantClear(ref PropVariant value);

  private static PropVariant Read(string path, uint propertyId) {
    Guid interfaceId = new Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99");
    IPropertyStore store;
    int result = SHGetPropertyStoreFromParsingName(path, IntPtr.Zero, 0, ref interfaceId, out store);
    if (result != 0) Marshal.ThrowExceptionForHR(result);
    try {
      PropertyKey key = new PropertyKey(
        new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
        propertyId
      );
      PropVariant value;
      result = store.GetValue(ref key, out value);
      if (result != 0) Marshal.ThrowExceptionForHR(result);
      return value;
    } finally {
      Marshal.ReleaseComObject(store);
    }
  }

  public static string ReadString(string path, uint propertyId) {
    PropVariant value = Read(path, propertyId);
    try {
      if (value.valueType == 0) return null;
      if (value.valueType != 31) throw new InvalidOperationException("PROPERTY_NOT_STRING_" + value.valueType);
      return Marshal.PtrToStringUni(value.pointerValue);
    } finally {
      PropVariantClear(ref value);
    }
  }

  public static string ReadGuid(string path, uint propertyId) {
    PropVariant value = Read(path, propertyId);
    try {
      if (value.valueType == 0) return null;
      if (value.valueType != 72) throw new InvalidOperationException("PROPERTY_NOT_GUID_" + value.valueType);
      return ((Guid)Marshal.PtrToStructure(value.pointerValue, typeof(Guid))).ToString();
    } finally {
      PropVariantClear(ref value);
    }
  }
}
'@

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
if ($shortcut.TargetPath -ne $expectedExecutable) {
  throw 'MASHIRO_SHORTCUT_TARGET_MISMATCH'
}

$appUserModelId = [MashiroShortcutProperties]::ReadString($shortcutPath, 5)
$toastActivator = [MashiroShortcutProperties]::ReadGuid($shortcutPath, 26)
if ($appUserModelId -ne 'io.github.molotov0cocktail.mashiro') {
  throw 'MASHIRO_SHORTCUT_AUMID_MISMATCH'
}
if ($null -eq $toastActivator) {
  throw 'MASHIRO_SHORTCUT_TOAST_ACTIVATOR_MISSING'
}

$clsid = '{' + $toastActivator.ToUpperInvariant() + '}'
$serverKey = "HKCU:\Software\Classes\CLSID\$clsid\LocalServer32"
$localServer = Get-ItemPropertyValue -LiteralPath $serverKey -Name '(default)' -ErrorAction Stop

[pscustomobject]@{
  observedAt = (Get-Date).ToString('o')
  shortcut = [pscustomobject]@{
    path = $shortcutPath
    sha256 = (Get-FileHash -LiteralPath $shortcutPath -Algorithm SHA256).Hash
    target = $shortcut.TargetPath
    arguments = $shortcut.Arguments
    appUserModelId = $appUserModelId
    toastActivatorClsid = $clsid
  }
  registration = [pscustomobject]@{
    scope = 'current-user'
    path = "Software\Classes\CLSID\$clsid\LocalServer32"
    value = $localServer
    referencesCurrentExecutable = $localServer.IndexOf($expectedExecutable, [StringComparison]::OrdinalIgnoreCase) -ge 0
  }
} | ConvertTo-Json -Depth 5

