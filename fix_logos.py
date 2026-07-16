with open('docs/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace header logo
content = content.replace(
    '<img src="assets/logo-harness.png" alt="Logo" height="36">',
    '<img src="assets/opencode-wordmark-dark.svg" alt="OpenCode Logo" height="28">'
)

# Replace hero logo
content = content.replace(
    '<img src="assets/logo-harness.png" alt="Logo" width="320" class="hero-logo">',
    '<img src="assets/opencode-wordmark-dark.svg" alt="OpenCode Logo" width="240" class="hero-logo">'
)

# Replace ecosystem strip inline SVG for OpenCode with the actual logo
old_ecosystem_svg = '<span><svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12c0 5.522 4.477 10 10 10 5.522 0 10-4.478 10-10 0-5.523-4.478-10-10-10zm-1.8 14.5v-9h1.5v7.5h3.5v1.5h-5z"/></svg> OpenCode</span>'
new_ecosystem_svg = '<span><img src="assets/opencode-logo-dark.svg" alt="OpenCode" width="24" height="24" style="margin-right: -4px;"> OpenCode</span>'

content = content.replace(old_ecosystem_svg, new_ecosystem_svg)

with open('docs/index.html', 'w', encoding='utf-8') as f:
    f.write(content)

