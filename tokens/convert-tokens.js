const fs = require('fs');
const path = require('path');

// File paths
const colorTokensPath = path.join(__dirname, 'color-tokens.json');
const designTokensPath = path.join(__dirname, 'design-tokens.tokens.json');
const outputPath = path.join(__dirname, 'tokens.css');

// Read JSON files
const colorTokensData = JSON.parse(fs.readFileSync(colorTokensPath, 'utf8'));
const designTokensData = JSON.parse(fs.readFileSync(designTokensPath, 'utf8'));

/**
 * Format dimension values (add 'px' if numeric)
 */
function formatDimension(val) {
  if (val === undefined || val === null) return '0';
  if (typeof val === 'number') {
    return val === 0 ? '0' : `${val}px`;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!isNaN(Number(trimmed))) {
      return Number(trimmed) === 0 ? '0' : `${trimmed}px`;
    }
    return trimmed;
  }
  return String(val);
}

/**
 * Format typography dimensions, optionally converting px to rem.
 * Body text uses rem so it respects the user's browser font size.
 */
function formatTypographyDimension(val, useRem) {
  if (useRem) {
    const numeric = typeof val === 'number' ? val : Number(String(val).trim());
    if (!isNaN(numeric)) {
      return numeric === 0 ? '0' : `${numeric / 16}rem`;
    }
  }
  return formatDimension(val);
}

/**
 * Format font family string
 */
function formatFontFamily(family) {
  if (!family) return 'sans-serif';
  const cleanFamily = family.replace(/^['"]|['"]$/g, '');
  if (cleanFamily.includes(' ')) {
    return `"${cleanFamily}", sans-serif`;
  }
  return `${cleanFamily}, sans-serif`;
}

/**
 * Helper to convert token names to kebab-case slug
 */
function toKebabCase(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// 1. Process Typography Tokens
let typographyRootVars = [];

// Process 'font' or 'typography' sections from design-tokens.tokens.json
const typographySource = designTokensData.typography || designTokensData.font || {};

for (const [category, styles] of Object.entries(typographySource)) {
  for (const [styleName, tokenData] of Object.entries(styles)) {
    // Extract token values whether structured as custom-fontStyle or individual dimension tokens
    let fontVal = {};
    if (tokenData.type === 'custom-fontStyle' && tokenData.value) {
      fontVal = tokenData.value;
    } else if (typeof tokenData === 'object') {
      for (const [propKey, propObj] of Object.entries(tokenData)) {
        if (propObj && typeof propObj === 'object' && 'value' in propObj) {
          fontVal[propKey] = propObj.value;
        } else {
          fontVal[propKey] = propObj;
        }
      }
    }

    const kebabStyleName = toKebabCase(styleName);
    const useRem = category.toLowerCase() === 'body';

    const fontFamily = formatFontFamily(fontVal.fontFamily);
    const fontSize = formatTypographyDimension(fontVal.fontSize, useRem);
    const fontWeight = fontVal.fontWeight || 400;
    const lineHeight = formatTypographyDimension(fontVal.lineHeight, useRem);
    const letterSpacing = formatTypographyDimension(fontVal.letterSpacing, useRem);
    const fontStyle = fontVal.fontStyle || 'normal';
    const textDecoration = fontVal.textDecoration || 'none';

    typographyRootVars.push(`  /* Typography: ${styleName} */`);
    typographyRootVars.push(`  --font-${kebabStyleName}-font-family: ${fontFamily};`);
    typographyRootVars.push(`  --font-${kebabStyleName}-font-size: ${fontSize};`);
    typographyRootVars.push(`  --font-${kebabStyleName}-font-weight: ${fontWeight};`);
    typographyRootVars.push(`  --font-${kebabStyleName}-line-height: ${lineHeight};`);
    typographyRootVars.push(`  --font-${kebabStyleName}-letter-spacing: ${letterSpacing};`);
    typographyRootVars.push(`  --font-${kebabStyleName}-font-style: ${fontStyle};`);
    typographyRootVars.push(`  --font-${kebabStyleName}-text-decoration: ${textDecoration};`);
    typographyRootVars.push(`  --font-${kebabStyleName}: ${fontStyle} ${fontWeight} ${fontSize}/${lineHeight} ${fontFamily};`);
    typographyRootVars.push('');
  }
}

// 2. Process Color Tokens
const colorData = colorTokensData.color || {};
const lightColors = colorData.light || {};
const darkColors = colorData.dark || {};

let primitiveLightVars = [];
let primitiveDarkVars = [];
let lightRoleVars = [];
let darkRoleVars = [];

// Populate Primitive colors and Light Color Roles
for (const [roleKey, colorValue] of Object.entries(lightColors)) {
  const kebabRole = toKebabCase(roleKey);
  const primitiveVarName = `--primitive-color-light-${kebabRole}`;

  primitiveLightVars.push(`  ${primitiveVarName}: ${colorValue};`);

  // Color roles point to primitive color variables
  lightRoleVars.push(`  --${kebabRole}: var(${primitiveVarName});`);

  // If kebabRole doesn't already start with "color-", add a --color- alias for maximum compatibility
  if (!kebabRole.startsWith('color-')) {
    lightRoleVars.push(`  --color-${kebabRole}: var(${primitiveVarName});`);
  }
}

// Populate Primitive colors and Dark Color Roles
for (const [roleKey, colorValue] of Object.entries(darkColors)) {
  const kebabRole = toKebabCase(roleKey);
  const primitiveVarName = `--primitive-color-dark-${kebabRole}`;

  primitiveDarkVars.push(`  ${primitiveVarName}: ${colorValue};`);

  // Color roles point to primitive color variables for dark mode
  darkRoleVars.push(`  --${kebabRole}: var(${primitiveVarName});`);

  if (!kebabRole.startsWith('color-')) {
    darkRoleVars.push(`  --color-${kebabRole}: var(${primitiveVarName});`);
  }
}

// 3. Assemble Complete CSS File Content
const cssLines = [
  '/**',
  ' * AUTO-GENERATED DESIGN TOKENS CSS',
  ' * Created by convert-tokens.js',
  ' * Contains typography tokens, primitive color tokens, and semantic color roles.',
  ' */',
  '',
  ':root {',
  '  /* ==========================================================================',
  '   * TYPOGRAPHY TOKENS',
  '   * ========================================================================== */',
  ...typographyRootVars,
  '  /* ==========================================================================',
  '   * PRIMITIVE COLOR TOKENS (Light Theme)',
  '   * Raw color values - Should NOT be used directly in component styles',
  '   * ========================================================================== */',
  ...primitiveLightVars,
  '',
  '  /* ==========================================================================',
  '   * PRIMITIVE COLOR TOKENS (Dark Theme)',
  '   * Raw color values - Should NOT be used directly in component styles',
  '   * ========================================================================== */',
  ...primitiveDarkVars,
  '',
  '  /* ==========================================================================',
  '   * SEMANTIC COLOR ROLES (Default / Light Theme)',
  '   * Components and UI elements must ALWAYS use these color role variables',
  '   * ========================================================================== */',
  ...lightRoleVars,
  '}',
  '',
  '/* ==========================================================================',
  ' * SEMANTIC COLOR ROLES (Dark Theme Overrides)',
  ' * Activated via data-theme="dark", .dark-theme, .dark, or prefers-color-scheme',
  ' * ========================================================================== */',
  '[data-theme="dark"],',
  '.dark-theme,',
  '.dark {',
  ...darkRoleVars,
  '}',
  '',
  '@media (prefers-color-scheme: dark) {',
  '  :root:not([data-theme="light"]):not(.light-theme):not(.light) {',
  ...darkRoleVars,
  '  }',
  '}',
  ''
];

const cssContent = cssLines.join('\n');
fs.writeFileSync(outputPath, cssContent, 'utf8');
console.log(`Successfully generated CSS variables in ${outputPath}`);
