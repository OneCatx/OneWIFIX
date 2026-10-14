param(
    [string]$Checkout = '/mnt/e/GQ/Ultra/mdd-sim-gateway',
    [string[]]$TestArgs = @('discover', '-s', 'tests', '-v'),
    [switch]$CurrentRegression
)
$ErrorActionPreference = 'Stop'
$stateRoot = '/mnt/e/GQ/Ultra/mdd-sim-gateway/docs/onewifi-migration'
$testTemp = "$stateRoot/linux-tmp"
$runData = "$testTemp/runtime-$([guid]::NewGuid().ToString('N'))"
wsl --exec mountpoint -q $testTemp
if ($LASTEXITCODE -ne 0) {
    $diskTarget = Join-Path $PSScriptRoot 'linux-tmp'
    if ((Resolve-Path -LiteralPath $diskTarget).Path -ne 'E:\GQ\Ultra\mdd-sim-gateway\docs\onewifi-migration\linux-tmp') {
        throw 'Unexpected Linux test mount target'
    }
    if (Get-ChildItem -LiteralPath $diskTarget -Force) {
        throw 'Linux test mount target is not empty; refusing to hide files'
    }
    wsl --user root --exec mount -t tmpfs -o size=256M,nosuid,nodev,mode=1777 tmpfs $testTemp
    if ($LASTEXITCODE -ne 0) { throw 'Cannot mount Linux test temporary filesystem' }
}
[string[]]$pythonArgs = if ($CurrentRegression) {
    @("$stateRoot/run-current-regression.py")
} else {
    @('-m', 'unittest') + $TestArgs
}
wsl --cd $Checkout --exec env `
    "PYTHONDONTWRITEBYTECODE=1" `
    "TMPDIR=$testTemp" `
    "MDD_DATA=$runData" `
    "LD_LIBRARY_PATH=$stateRoot/linux-pcsc/extracted/usr/lib/x86_64-linux-gnu" `
    /mnt/e/GQ/Ultra/mdd-sim-gateway/.venv-linux/bin/python @pythonArgs
exit $LASTEXITCODE

