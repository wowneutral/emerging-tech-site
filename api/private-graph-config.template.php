<?php
/**
 * TEMPLATE. Do not upload this file as-is, and never commit the real
 * version to git or place it inside public_html.
 *
 * Copy this file to the account's private folder — the one visible in
 * FileZilla as a sibling of public_html, NOT inside it — and rename it to:
 *
 *   graph-config.php
 *
 * so the final path is:
 *
 *   /domains/emergingtech.co/private/graph-config.php
 *
 * That location has no URL that reaches it — Apache only ever serves
 * public_html — so this is a stronger guarantee than any .htaccess rule.
 *
 * tenant_id and client_id are identifiers, not secrets; they already live
 * in worker/wrangler.toml in this repo and are safe to see. client_secret
 * is the one real credential and must come from Seamus once the four Entra
 * items are done (see contact-form-setup-steps.md) — never from anywhere
 * this value has already travelled (Teams, a Word doc, this chat).
 */
return [
    'tenant_id'      => '10aa4af8-3fa7-4d50-93fb-d4b487fa3227',
    'client_id'      => '9542faa9-1536-4ad9-b85a-86a854d5605b',
    'client_secret'  => 'REPLACE-ME-with-the-fresh-secret-from-Seamus',
    'sender_address' => 'noreply@emergingtech.co',
    'to_address'     => 'collaborate@emergingtech.co',
];
