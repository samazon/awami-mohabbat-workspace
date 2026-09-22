/**
 * One job: keep `font-size` on tokens.
 *
 * Content type must go through --fs-* (which carries --reader-scale) and chrome
 * through --ui-*. A raw `font-size: 17px` silently opts an element out of the
 * A− / A / A+ control, so it fails lint.
 */
export default {
  rules: {
    'declaration-property-value-allowed-list': {
      'font-size': ['/^var\\(--(fs|ui)-[a-z0-9-]+\\)$/', 'inherit', '0'],
    },
  },
  overrides: [
    {
      files: ['**/*.astro'],
      customSyntax: 'postcss-html',
    },
    {
      // tokens.css is where the raw values are *defined* — the rule doesn't apply there.
      files: ['src/styles/tokens.css'],
      rules: { 'declaration-property-value-allowed-list': null },
    },
  ],
};
