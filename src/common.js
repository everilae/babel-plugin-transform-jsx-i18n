export const I18N_MSG_ATTRIBUTE = "i18nMsg";
export const I18N_COMMENT_ATTRIBUTE = "i18nComment";
export const FORMAT_ATTRIBUTE = "format";
export const COMPONENT_ATTRIBUTE = "component";
export const EXPRESSIONS_ATTRIBUTE = "expressions";
export const TRANSLATOR_ATTRIBUTE = "translator";
export const LANG_ATTRIBUTE = "lang";
export const TRANSLATOR_IDENTIFIER_DEFAULT = "gettext";
export const NORMALIZE_WHITESPACE_DEFAULT = true;

export const TRANSLATABLE_ATTRIBUTES = [
  "alt",
  "placeholder",
  "title"
];

export const ELEMENT_TYPE_BLACKLIST = [
  // As to why would anyone have inline styles in React...
  "style",
  "code"
];
