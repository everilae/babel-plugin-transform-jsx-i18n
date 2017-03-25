export const I18N_MSG_ATTRIBUTE = "i18nMsg";
export const FORMAT_ATTRIBUTE = "format";
export const COMPONENT_ATTRIBUTE = "component";
export const EXPRESSIONS_ATTRIBUTE = "expressions";
export const TRANSLATOR_ATTRIBUTE = "translator";
export const LANG_ATTRIBUTE = "lang";

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
