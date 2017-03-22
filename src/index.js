import jsx from "babel-plugin-syntax-jsx";

const DEFAULT_GETTEXT = 'gettext';

export default function ({ types: t }) {
  function isTranslatableText(node) {
    return t.isJSXText(node) && node.value.trim();
  }

  function translatedText(messageId) {
    return t.callExpression(
      t.identifier(DEFAULT_GETTEXT),
      [ t.stringLiteral(messageId) ]
    );
  }

  const visitor = {
    JSXElement(path, stats) {
      let hasTranslatableText = false;

      for (const child of path.node.children) {
        if (isTranslatableText(child)) {
          hasTranslatableText = true;
          break;
        }
      }

      if (!hasTranslatableText) {
        return;
      }

      const newChildren = path.node.children.map(child => {
        if (isTranslatableText(child)) {
          return t.jSXExpressionContainer(translatedText(child.value));
        } else {
          return child;
        }
      });

      path.replaceWith(
        t.jSXElement(
          path.node.openingElement,
          path.node.closingElement,
          newChildren,
          path.node.selfClosing
        )
      );
    }
  };

  return {
    inherits: jsx,
    visitor
  };
}
