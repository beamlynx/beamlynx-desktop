# Credential Storage

Saved connection passwords are encrypted before they're written to disk. Only
the password is encrypted -- host/port/db/user are already visible elsewhere
(the connect form, the connection label), so encrypting those too would add
cost with no real protection gained.

## Why an encrypted password in a plain JSON file is correct

The OS keyring is involved, but not the way people expect: it doesn't hold
the password itself. It holds an AES-256 key. That key encrypts the
password (AES-256-GCM), and it's the resulting ciphertext -- base64-encoded
-- that ends up sitting in the connections file. Seeing an "encrypted"
string in a plain JSON file is the intended shape of this integration, not a
fallback or a bug: the keyring secures the key, the file only ever holds
something useless without it.

## What happens when there's no real keyring

On Linux, a real secret service (gnome-keyring, KWallet) isn't always
reachable -- especially outside GNOME/KDE session environments. When that's
the case, the underlying encryption library falls back to a hardcoded,
publicly-known key instead of a real one. That's treated as equivalent to
no protection at all: rather than write a password "encrypted" with a key
anyone can find, saving is refused outright and nothing is persisted.

## Inspecting the key yourself

Where the key itself lives depends on which secret service is active.

**gnome-keyring / libsecret:**

```sh
secret-tool search application beamlynx-desktop
```

This prints an entry labeled "Chromium Safe Storage" (inherited from the
underlying browser encryption library's naming, not specific to this app)
whose `secret` field is the base64 AES key. A GUI alternative is `seahorse`
(GNOME Passwords and Keys) -- look under the "Login" keyring for the same
entry.

**KWallet:** `kwallet-query` is the CLI equivalent.

Anyone with that key plus the connections file can recover every saved
password in plaintext -- treat the key with the same care as the passwords
it protects. Don't paste it into logs, tickets, or chats.
