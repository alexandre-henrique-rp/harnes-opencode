with open('docs/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Revert header logo and change name
content = content.replace(
    '<img src="assets/opencode-wordmark-dark.svg" alt="OpenCode Logo" height="28">',
    '<img src="assets/logo-harness.png" alt="Logo" height="36">'
)
content = content.replace(
    '<span class="brand-text">OpenCode Agents v6</span>',
    '<span class="brand-text">Opencode Harness</span>'
)

# 2. Revert hero logo
content = content.replace(
    '<img src="assets/opencode-wordmark-dark.svg" alt="OpenCode Logo" width="240" class="hero-logo">',
    '<img src="assets/logo-harness.png" alt="Logo" width="320" class="hero-logo">'
)

# 3. Remove the button from the Hero
button_html = '<div class="hero-cta" style="margin-bottom: 3rem;"><a href="#" class="btn-primary" onclick="document.querySelector(\'.terminal\').scrollIntoView({behavior: \'smooth\'}); return false;" data-i18n="hero_cta">Instale Agora - É Grátis</a></div>'
# (Wait, if I use replace and the string is slightly different, it might fail. I'll use regex or string find)

import re

# Find and remove hero button
content = re.sub(
    r'<div class="hero-cta".*?>.*?</div>',
    '',
    content,
    flags=re.DOTALL
)

# 4. Insert the new CTA section at the end before Footer
new_cta_section = """
  <!-- Final CTA -->
  <section style="padding: 2rem 0 6rem; text-align: center;">
    <div class="container">
      <h2 class="section-title" style="margin-bottom: 2rem; font-size: 2rem;">Pronto para transformar sua engenharia?</h2>
      <a href="#" class="btn-primary" onclick="document.querySelector('.terminal').scrollIntoView({behavior: 'smooth', block: 'center'}); return false;" data-i18n="hero_cta">Instale Agora - É Grátis</a>
    </div>
  </section>

"""
content = content.replace('  <!-- Footer -->', new_cta_section + '  <!-- Footer -->')

with open('docs/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
