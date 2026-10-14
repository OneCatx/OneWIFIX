# AT&T and Three HK carrier continuation report

Date: 2026-10-13  
Scope: carrier resolver metadata and focused source tests only. `NEWONE` remained read-only.

## Decision

**AT&T (`310/280`) and Three HK (`454/03`) remain `blocked`.** No automatic carrier
defaults were enabled. The current MDD contracts cannot safely represent either complete
profile, and a realm-only or `sec_encryption=no` change would present a half-profile to IMS.

## Safe change delivered

`control/app/carrier_profiles.py` now reports the complete known unsupported capability names
for both blocked profiles and exposes a non-secret `blocked_contract()` object. The rendered
`instance.json` contract carries `carrier_block` with code `carrier_profile_unsupported`,
profile, blocked status, operator-facing reason, and unsupported field names. `resolve()` still
returns `operational_status="blocked"`, and `config.render_instance_json()` continues to
withhold the profile's automatic route, PANI, expiry, User-Agent, security, and registration
defaults. No credentials or subscriber identity enter the block object. This closes the
**automatic profile application** path; it does not prevent an operator's existing generic
MDD line from starting or make a new UI render the block yet.

Added `tests/test_att_three_blockers.py`, which asserts the blocked status, the exact
identity/header/security gap inventory, and the rendered unsupported-profile contract. Existing
resolver/render tests remain unchanged.

## Why full implementation is blocked

### AT&T

The source profile needs a paired public identity (`one.att.net`) and private identity
(`private.att.net`) bound together across the registration client URI, auth username, and all
initial/authenticated/retry/unregister paths. MDD currently renders one IMS realm and one
`client_uri`/auth username pair from `subscriber_imsi`; there is no contract for carrying a
separate private identity while preserving the public identity used in `From`/Contact.

The pinned Asterisk consumer also lacks AT&T's complete registration behavior: Contact ordering
and tags, 18400-second expiry, Supported/Allow, P-Preferred-Identity, P-Visited-Network-ID,
PANI, Cellular-Network-Info, Accept-Contact, and the AT&T-specific AES-CBC/SHA1 offer/server
port (6000). Adding only a realm, one header, or one port would be an unsafe partial profile.

### Three HK

The source behavior requires the same IKE/EAP session's RAND/AUTN/RES material to reach the
SIP registration process exactly once, with a bounded authenticated local handoff, expiry,
zeroization after consume/failure/restart, and no logging or persistence. MDD has no such
secure SWu-to-Asterisk contract. It also has no direct first-REGISTER Authorization builder,
no explicit no-sec-agree branch, and no consumer for the complete Supported/Allow,
Accept-Contact, P-Preferred-Identity, User-Agent, expiry, and PANI settings.

The existing template's `sec_encryption=no` only disables the null-IPsec offer; the current
VoLTE path still emits Security-Client/sec-agree behavior. It therefore cannot stand in for
Three HK's `ims.security=disabled` semantics.

## Focused RED/GREEN evidence

RED was observed before the production edit:

```text
tests.test_att_three_blockers: 2 failures
'ims.register_options.supported_header' not found in ['ims.identity_profile', 'ims.register_profile', 'ims.ipsec_encryption']
'ims.eap_material_handoff' not found in ['ims.security', 'ims.initial_authorization', ...]
```

After the metadata-only change, the real Linux wrapper passed:

```text
& .\docs\onewifi-migration\run-linux-tests.ps1 \
  -TestArgs 'tests.test_att_three_blockers','tests.test_onewifi_carrier_profiles'
Ran 15 tests ... OK
```

`python -m py_compile control/app/carrier_profiles.py tests/test_att_three_blockers.py` and
`git diff --check` passed for the touched files.

The 2026-10-14 unsupported-profile contract extension was RED first (`KeyError: 'carrier_block'`),
then the same real WSL wrapper passed **15 tests** across blocker and carrier-profile modules.
An independent focused WSL run of `tests.test_engine_paths`, `tests.test_line_user_agent`,
and `tests.test_invite_uri_params` passed **52 tests**. Current `py_compile` covers
`control/app/carrier_profiles.py`, `control/app/config.py`, and
`tests/test_att_three_blockers.py`; `git diff --check` passes for those touched paths.

These are source-level tests only. No Asterisk C compile/image/install, SIP wire capture,
ePDG/IMS registration, real SIM, call, SMS, or provider acceptance was performed.

## Freeze / handoff

The safe resolver guard is frozen. Unblocking either carrier requires an explicit contract
design and tests for the missing consumers above, especially the secure same-session EAP
handoff and paired AT&T identity binding. Do not infer carrier support from a matched profile
ID or this metadata.
