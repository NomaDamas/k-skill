#!/usr/bin/env perl
# scan_secrets.pl — Deterministic secrets scanner for git diffs
# Version: 2.0.0
# Usage: git diff --staged | perl ~/.claude/skills/pre-push/scripts/scan_secrets.pl
# Exit code: 0 = clean, 1 = issues found
#
# Design: scans ONLY added (+) lines to avoid blocking secret removal commits.
# Exception: merge conflict markers are checked on all lines (added + context).
# \x27 = single quote (avoids shell quoting issues inside heredocs)

while (<STDIN>) {
  # Merge conflict markers — check ALL lines (added + unchanged context).
  # Unresolved conflicts on context lines are just as dangerous as on added lines.
  $f_merge=1 if /^[+ ](<{7} |={7}\s*$|>{7} )/;

  # All remaining checks: ONLY scan added lines. Skip removed (-) lines to avoid
  # blocking commits that are REMOVING secrets (that would be counterproductive).
  next unless /^\+/;
  next if /^\+\+\+/;  # skip "+++ b/filename" diff file headers

  # f1: AWS Access Key ID
  $f1=1 if /AKIA[0-9A-Z]{16}/;

  # f2: Private key header (RSA, EC, DSA, OpenSSH, generic)
  $f2=1 if /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/;

  # f3: Password embedded in connection/DSN string (skip ${VAR} and $(cmd) templates)
  $f3=1 if m{://[^\s:@]+:[^\s@]{4,}@} && !/\$\{|\$\(/;

  # f4a: Hardcoded credential assignment — quoted value (6+ chars between quotes)
  $f4a=1 if /(password|passwd|secret|api_key|apikey|access_token|auth_token|jwt_secret)\s*[=:]\s*[\x27"][^\x27"]{6,}[\x27"]/i;

  # f4b: Hardcoded credential assignment — unquoted YAML/ENV value
  # Anchored to start of added line to avoid matching inside string values or comments
  $f4b=1 if /^\+\s*(PASSWORD|PASSWD|SECRET|API_KEY|APIKEY|ACCESS_TOKEN|AUTH_TOKEN|JWT_SECRET)[_A-Z0-9]*\s*[=:]\s*[^\s\x27"#\$\{]{6,}/i;

  # f5: Platform tokens
  # Slack: xox[b/a/p/r/s]-...
  # GitHub: ghp_ (PAT), gho_ (OAuth), ghu_ (user-to-server), ghs_ (Actions), ghr_ (refresh)
  # GitHub fine-grained PAT: github_pat_ (50+ chars, variable length)
  # Stripe live keys: sk_live_ / pk_live_
  $f5=1 if /xox[baprs]-[0-9A-Za-z\-]+|gh[poushr]_[0-9A-Za-z]{20,}|github_pat_[A-Za-z0-9_]{50,}|sk_live_[0-9A-Za-z]+|pk_live_[0-9A-Za-z]+/;

  # f6: Secret in Dockerfile ENV directive
  # Covers: ENV KEY=value (= form) and ENV KEY value (space-separator form)
  $f6=1 if /^\+.*ENV\s+\w*(?:PASSWORD|SECRET|KEY|TOKEN)\w*[\s=]/;

  # f7: Google / Gemini API Key (AIza + 35 alphanumeric chars = 39 total)
  $f7=1 if /AIza[0-9A-Za-z\-_]{35}/;

  # f8: npm registry auth token (in .npmrc files)
  $f8=1 if /_authToken=[A-Za-z0-9\-_]{20,}/;

  # f9: LLM provider API keys
  # Anthropic: sk-ant-...  |  OpenAI classic: sk-[48 alnum, word-boundary]
  # OpenAI project: sk-proj-...  |  HuggingFace: hf_...
  # Replicate: r8_...  |  Groq: gsk_...
  $f9=1 if /sk-ant-[A-Za-z0-9_\-]{20,}|sk-proj-[A-Za-z0-9_\-]{20,}|(?<![a-z])sk-[A-Za-z0-9]{48}(?![a-z])|hf_[A-Za-z0-9]{30,}|r8_[A-Za-z0-9]{30,}|gsk_[A-Za-z0-9]{40,}/;

  # f10: Azure credentials
  # Storage Account Key (86-char base64 + ==)  |  SAS token sig param  |  connection string prefix
  $f10=1 if /AccountKey=[A-Za-z0-9+\/]{86}==|[?&]sig=[A-Za-z0-9%+\/]{30,}|DefaultEndpointsProtocol=https;AccountName=/;
}

END {
  my $found = 0;
  if ($f_merge){ print "🚨 CRITICAL: Unresolved merge conflict markers detected\n";                                    $found=1; }
  if ($f1)     { print "🚨 CRITICAL: AWS Access Key ID detected\n";                                                   $found=1; }
  if ($f2)     { print "🚨 CRITICAL: Private key detected\n";                                                         $found=1; }
  if ($f3)     { print "🚨 CRITICAL: Password in connection string detected\n";                                       $found=1; }
  if ($f4a)    { print "🚨 HIGH: Hardcoded credential assignment (quoted value) detected\n";                          $found=1; }
  if ($f4b)    { print "🚨 HIGH: Hardcoded credential assignment (unquoted YAML/ENV) detected\n";                    $found=1; }
  if ($f5)     { print "🚨 CRITICAL: Platform token detected (Slack / GitHub / Stripe)\n";                           $found=1; }
  if ($f6)     { print "🚨 CRITICAL: Secret in Dockerfile ENV directive\n";                                          $found=1; }
  if ($f7)     { print "🚨 CRITICAL: Google / Gemini API Key detected\n";                                            $found=1; }
  if ($f8)     { print "🚨 HIGH: npm registry auth token detected\n";                                                $found=1; }
  if ($f9)     { print "🚨 CRITICAL: LLM provider API key detected (Anthropic / OpenAI / HuggingFace / Replicate / Groq)\n"; $found=1; }
  if ($f10)    { print "🚨 CRITICAL: Azure credential detected (Storage Key / SAS token / connection string)\n";     $found=1; }
  exit($found ? 1 : 0);
}

