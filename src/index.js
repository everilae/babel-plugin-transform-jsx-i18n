import jsx from "babel-plugin-syntax-jsx";

const DEFAULT_GETTEXT = 'gettext';

export default function ({ types: t }) {
  const visitor = {
    JSXElement(path, stats) {
      let hasTranslatableText = false;

      for (const child of path.node.children) {
        if (t.isJSXText(child) && child.value.trim()) {
          hasTranslatableText = true;
          break;
        }
      }

      if (!hasTranslatableText) {
        return;
      }

      const newChildren = path.node.children.map(child => {
        if (t.isJSXText(child) && child.value.trim()) {
          return t.jSXExpressionContainer(
            t.callExpression(
              t.identifier(DEFAULT_GETTEXT),
              [ t.stringLiteral(child.value) ]
            )
          );
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
