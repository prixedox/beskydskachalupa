import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/escape-html.js';

describe('escapeHtml', () => {
  it('escapes html special characters and keeps diacritics', () => {
    expect(escapeHtml('<b>Žlutá & "modrá"</b> \'x\'')).toBe('&lt;b&gt;Žlutá &amp; &quot;modrá&quot;&lt;/b&gt; &#39;x&#39;');
  });
});
