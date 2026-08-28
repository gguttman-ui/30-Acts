<#
    staging-setup.ps1
    30 Acts of Kindness - Supabase staging project setup
    Companion to SUPABASE-STAGING-SETUP-20260828.md (Steps 2 and 4)
    Prepared: Friday, August 28, 2026 - 9:15 AM Central Time

    WHAT THIS DOES
      1. Verifies the Supabase CLI is installed and you are logged in
      2. Dumps the PRODUCTION schema and roles to supabase\ (structure only)
      3. Scans the dump for anything that looks like real user data
      4. Deploys Edge Functions to STAGING
      5. Prompts for staging secrets and sets them

    WHAT THIS DOES NOT DO (do these by hand - see the doc)
      - Create the staging project
      - Auth provider settings
      - Extensions, storage buckets, the pg_cron job
      - Seed data

    HOW TO RUN
      Open PowerShell in the repo root, then:
        .\staging-setup.ps1 -StagingRef 'your_staging_ref_here'

      Dry run first (shows every command, changes nothing):
        .\staging-setup.ps1 -StagingRef 'your_staging_ref_here' -WhatIfOnly
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $StagingRef,

    [string] $ProdRef = 'mtfyekdxtkdiaqbgaoza',

    [string] $RepoRoot = (Get-Location).Path,

    [switch] $WhatIfOnly
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Step {
    param([string] $Text)
    Write-Host ''
    Write-Host ('=' * 74) -ForegroundColor DarkGray
    Write-Host "  $Text" -ForegroundColor Cyan
    Write-Host ('=' * 74) -ForegroundColor DarkGray
}

function Write-Ok    { param([string] $T) Write-Host "  [ok]   $T" -ForegroundColor Green }
function Write-Warn2 { param([string] $T) Write-Host "  [warn] $T" -ForegroundColor Yellow }
function Write-Info  { param([string] $T) Write-Host "  [info] $T" -ForegroundColor Gray }

function Invoke-Step {
    param(
        [string]   $Description,
        [string]   $Command,
        [string[]] $Arguments
    )

    $display = $Command + ' ' + ($Arguments -join ' ')
    Write-Info $display

    if ($WhatIfOnly) {
        Write-Warn2 'dry run - not executed'
        return $true
    }

    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 "FAILED (exit $LASTEXITCODE): $Description"
        return $false
    }
    Write-Ok $Description
    return $true
}

# ---------------------------------------------------------------------------
# Guard rails
# ---------------------------------------------------------------------------

if ($StagingRef -eq $ProdRef) {
    throw 'StagingRef and ProdRef are the same. Refusing to run.'
}

if ($StagingRef -match '^[<]' -or $StagingRef.Length -lt 15) {
    if ($WhatIfOnly) {
        Write-Host "  [warn] StagingRef '$StagingRef' is a placeholder - fine for a dry run." -ForegroundColor Yellow
    }
    else {
        throw "StagingRef '$StagingRef' does not look like a real project ref. Fill it in first."
    }
}

Write-Step 'Setting working directory'

Set-Location $RepoRoot
[Environment]::CurrentDirectory = (Get-Location).Path
Write-Ok "Repo root: $([Environment]::CurrentDirectory)"

if (-not (Test-Path 'supabase')) {
    throw "No 'supabase' folder here. Are you in the repo root?"
}

Write-Host ''
Write-Host "  PRODUCTION ref : $ProdRef"    -ForegroundColor DarkYellow
Write-Host "  STAGING ref    : $StagingRef" -ForegroundColor DarkGreen
if ($WhatIfOnly) { Write-Host '  MODE           : DRY RUN' -ForegroundColor Magenta }
Write-Host ''

$confirm = Read-Host 'Those refs correct? Type YES to continue'
if ($confirm -cne 'YES') {
    Write-Warn2 'Aborted.'
    return
}

# ---------------------------------------------------------------------------
# 1. CLI check
# ---------------------------------------------------------------------------

Write-Step '1 of 5 - Supabase CLI'

$cli = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $cli) {
    throw 'Supabase CLI not found on PATH. Install it, then re-run.'
}
Write-Ok "Found: $($cli.Source)"

Write-Info 'Checking login state (a browser may open)'
if (-not $WhatIfOnly) {
    supabase projects list
    if ($LASTEXITCODE -ne 0) {
        Write-Warn2 'Not logged in - running supabase login'
        supabase login
        if ($LASTEXITCODE -ne 0) { throw 'Login failed.' }
    }
}
Write-Ok 'Authenticated'

# ---------------------------------------------------------------------------
# 2. Dump production schema
# ---------------------------------------------------------------------------

Write-Step '2 of 5 - Dump PRODUCTION schema (structure only)'

$schemaPath = Join-Path $RepoRoot 'supabase\prod-schema.sql'
$rolesPath  = Join-Path $RepoRoot 'supabase\prod-roles.sql'

$ok = Invoke-Step 'Link to production' 'supabase' @('link', '--project-ref', $ProdRef)
if (-not $ok) { throw 'Could not link to production.' }

$ok = Invoke-Step 'Dump schema' 'supabase' @('db', 'dump', '-f', 'supabase\prod-schema.sql')
if (-not $ok) { throw 'Schema dump failed.' }

$ok = Invoke-Step 'Dump roles' 'supabase' @('db', 'dump', '-f', 'supabase\prod-roles.sql', '--role-only')
if (-not $ok) { Write-Warn2 'Role dump failed - usually harmless, continuing.' }

# ---------------------------------------------------------------------------
# 3. Safety scan of the dump
# ---------------------------------------------------------------------------

Write-Step '3 of 5 - Scanning the dump for real user data'

if ((-not $WhatIfOnly) -and (Test-Path $schemaPath)) {

    $sizeKb = [math]::Round((Get-Item $schemaPath).Length / 1KB, 1)
    Write-Ok "prod-schema.sql written ($sizeKb KB)"

    $sensitive = @('profiles', 'completions', 'waitlist', 'reminder_sends', 'challenge_participants')
    $found = $false

    foreach ($table in $sensitive) {
        $hits = Select-String -Path $schemaPath -Pattern ('INSERT INTO.*' + $table) -AllMatches -ErrorAction SilentlyContinue
        if ($hits) {
            Write-Warn2 "Found INSERT statements for '$table' - that is REAL USER DATA."
            $found = $true
        }
    }

    if ($found) {
        Write-Host ''
        Write-Warn2 'STOP. Do not apply this dump to staging as-is.'
        Write-Warn2 'Open prod-schema.sql and remove those INSERT blocks first.'
        Write-Host ''
    }
    else {
        Write-Ok 'No user-table INSERT statements found - structure only, as expected.'
    }

    $phoneHits = Select-String -Path $schemaPath -Pattern '\+1[0-9]{10}' -AllMatches -ErrorAction SilentlyContinue
    if ($phoneHits) {
        Write-Warn2 "Phone-number-shaped strings found on $($phoneHits.Count) line(s). Review before applying."
    }
}
else {
    Write-Info 'Skipped (dry run, or dump not present)'
}

Write-Host ''
Write-Info 'Apply the schema to staging by pasting prod-schema.sql into the'
Write-Info 'STAGING project SQL Editor. That is more reliable than db push here.'
Write-Host ''

$applied = Read-Host 'Schema applied to staging? Type YES to continue to functions, anything else to stop'
if ($applied -cne 'YES') {
    Write-Warn2 'Stopping here. Re-run with the same arguments once the schema is in.'
    return
}

# ---------------------------------------------------------------------------
# 4. Deploy Edge Functions to staging
# ---------------------------------------------------------------------------

Write-Step '4 of 5 - Deploy Edge Functions to STAGING'

$fnRoot = Join-Path $RepoRoot 'supabase\functions'

if (Test-Path $fnRoot) {
    $fns = Get-ChildItem -Path $fnRoot -Directory -ErrorAction SilentlyContinue
    if (-not $fns) {
        Write-Warn2 'No function folders found.'
    }
    foreach ($fn in $fns) {
        if ($fn.Name -eq '_shared') { continue }
        Invoke-Step "Deploy $($fn.Name)" 'supabase' @('functions', 'deploy', $fn.Name, '--project-ref', $StagingRef)
    }
}
else {
    Write-Warn2 "No supabase\functions folder - skipping."
}

# ---------------------------------------------------------------------------
# 5. Staging secrets
# ---------------------------------------------------------------------------

Write-Step '5 of 5 - Staging secrets'

Write-Info 'Use Twilio TEST credentials here, not the production toll-free number.'
Write-Info 'Press Enter on any prompt to skip that secret.'
Write-Host ''

$secretNames = @('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER')

foreach ($name in $secretNames) {
    $val = Read-Host "  $name"
    if ([string]::IsNullOrWhiteSpace($val)) {
        Write-Info "skipped $name"
        continue
    }
    if ($val.Contains('$')) {
        Write-Warn2 "$name contains a dollar sign - setting it literally, not interpolating."
    }
    Invoke-Step "Set $name" 'supabase' @('secrets', 'set', '--project-ref', $StagingRef, "$name=$val")
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Step 'Done - still to do by hand'

Write-Host @'
  [ ] Extensions:  create extension if not exists pg_cron;  pg_net;
  [ ] Auth:        email provider ON, confirm email OFF
  [ ] Triggers:    verify the auth.users profile trigger came across
  [ ] RLS:         confirm relrowsecurity = true on every table that has it in prod
  [ ] Storage:     recreate buckets and their policies
  [ ] pg_cron:     schedule send-reminders, URL pointing at the STAGING ref
  [ ] Seed:        content rows + test accounts
  [ ] eas.json:    preview profile -> staging, production profile -> production

  Full detail: SUPABASE-STAGING-SETUP-20260828.md
'@ -ForegroundColor Gray

Write-Host ''
Write-Warn2 'Before any TestFlight promote: check the Settings build stamp.'
Write-Host ''
