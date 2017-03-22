import jsx from "babel-plugin-syntax-jsx";

const I18N_MSG_ATTRIBUTE = "i18nMsg";
const DEFAULT_GETTEXT = "gettext";
const TRANSLATABLE_ATTRIBUTES = [
  "alt",
  "placeholder",
  "title"
];

export default function ({ types: t }) {
  function isTranslatableText(node) {
    return t.isJSXText(node) && node.value.trim();
  }

  function isTranslatableAttribute(attr) {
    return TRANSLATABLE_ATTRIBUTES.includes(attr.name.name) &&
      t.isStringLiteral(attr.value) &&
      attr.value.value.trim();
  }

  function add(x, y, ...rest) {
    return rest.reduce(
      (left, right) => t.binaryExpression('+', left, right),
      t.binaryExpression('+', x, y));
  }

  function translatedText(text) {
    const [ , leadingWs, messageId, trailingWs ] =
      /^(\s*)(.+?)(\s*)$/.exec(text);

    const translation = t.callExpression(
      t.identifier(DEFAULT_GETTEXT),
      [ t.stringLiteral(messageId) ]
    );

    // Special case
    if (!leadingWs && !trailingWs) {
      return translation;
    }

    return add(
      t.stringLiteral(leadingWs),
      translation,
      t.stringLiteral(trailingWs)
    );
  }

  function hasTranslatableText(node) {
    for (const child of node.children) {
      if (isTranslatableText(child)) {
        return true;
      }
    }

    for (const attr of node.openingElement.attributes) {
      if (isTranslatableAttribute(attr)) {
        return true;
      }
    }

    return false;
  }

  function translateAttributes(attributes) {
    return attributes.map(attr => {
      if (isTranslatableAttribute(attr)) {
        return t.jSXAttribute(
          attr.name,
          t.jSXExpressionContainer(translatedText(attr.value.value))
        );
      } else {
        return attr;
      }
    });
  }

  function simpleTranslation(path, stats) {
    const { node } = path;

    if (!hasTranslatableText(node)) {
      return;
    }

    const newOpeningElement = t.jSXOpeningElement(
      node.openingElement.name,
      translateAttributes(node.openingElement.attributes),
      node.openingElement.selfClosing
    );

    const newChildren = node.children.map(child => {
      if (isTranslatableText(child)) {
        return t.jSXExpressionContainer(translatedText(child.value));
      } else {
        return child;
      }
    });

    return path.replaceWith(
      t.jSXElement(
        newOpeningElement,
        node.closingElement,
        newChildren,
        node.selfClosing
      )
    );
  }

  function hasI18nMsg(node) {
    for (const attr of node.openingElement.attributes) {
      if (attr.name.name === I18N_MSG_ATTRIBUTE) {
        return true;
      }
    }
    return false;
  }

  function complexTranslation(path, stats) {
    console.warn("Complex translations note yet supported, ignoring i18nMsg attribute.");
    const { node } = path;

    const newOpeningElement = t.jSXOpeningElement(
      node.openingElement.name,
      node.openingElement.attributes.filter(
        attr => attr.name.name !== I18N_MSG_ATTRIBUTE
      ),
      node.openingElement.selfClosing
    );

    return path.replaceWith(
      t.jSXElement(
        newOpeningElement,
        node.closingElement,
        node.children,
        node.selfClosing
      )
    );
  }

  const visitor = {
    JSXElement(path, stats) {
      if (hasI18nMsg(path.node)) {
        return complexTranslation(path, stats);
      } else {
        return simpleTranslation(path, stats);
      }
    }
  };

  return {
    inherits: jsx,
    visitor
  };
}
