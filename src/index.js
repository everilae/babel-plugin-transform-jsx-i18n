import jsx from "babel-plugin-syntax-jsx";

const TRANSLATOR_IDENTIFIER = "gettext";
const MESSAGE_IDENTIFIER = "Message"; 

const I18N_MSG_ATTRIBUTE = "i18nMsg";
const FORMAT_ATTRIBUTE = "format";
const COMPONENT_ATTRIBUTE = "component";
const EXPRESSIONS_ATTRIBUTE = "expressions";
const TRANSLATOR_ATTRIBUTE = "translator";

const TRANSLATABLE_ATTRIBUTES = [
  "alt",
  "placeholder",
  "title"
];

export { default as Message } from './Message';

function getTranslator(state) {
  return state.opts.translator || TRANSLATOR_IDENTIFIER;
}

function normalizeWhitespace(state) {
  const normWs = state.opts.normalizeWhitespace;
  return normWs != null ? normWs : true;
}

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

  function translatedText(text, state) {
    const [ , leadingWs, messageId, trailingWs ] =
      /^(\s*)(.+?)(\s*)$/.exec(text);

    const translation = t.callExpression(
      t.identifier(getTranslator(state)),
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

    return false;
  }

  function simpleTranslation(path, state) {
    const { node } = path;

    const newChildren = node.children.map(child => {
      if (isTranslatableText(child)) {
        return t.jSXExpressionContainer(translatedText(child.value, state));
      } else {
        return child;
      }
    });

    return path.replaceWith(
      t.jSXElement(
        node.openingElement,
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

  function partitionAttributes(attributes) {
    return attributes.reduce(
      (acc, attr) => {
        if (attr.name.name === I18N_MSG_ATTRIBUTE) {
          acc[0] = attr;
        } else {
          acc[1].push(attr);
        }
        return acc;
      },
      [null, []]
    );
  }

  function stripElement(node, attributes) {
    return t.jSXElement(
      t.jSXOpeningElement(
        node.openingElement.name,
        attributes || node.openingElement.attributes,
        true
      ),
      null, [], true
    );
  }

  function extract(node, placeholders, normalizeWs, elements=[], expressions=[]) {
    let format = "";

    for (const child of node.children) {
      if (t.isJSXText(child)) {
        format += child.value;
      }
      else if (t.isJSXElement(child)) {
        const idx = elements.length + 1;
        elements.push(stripElement(child));
        const fmt = extract(child, placeholders, normalizeWs, elements, expressions)[0];
        format += `[${idx}:${fmt}]`;
      }
      else if (t.isJSXExpressionContainer(child)) {
        const p = placeholders[expressions.length];
        expressions.push(child);
        format += `{${p}}`;
      }
    }

    // Normalize whitespace.
    // FIXME: Will cause trouble in <pre>, fix later.
    if (normalizeWs) {
      format = format.replace(/\s+/g, " ");
    }

    return [ format, elements, expressions ];
  }

  function asList(node) {
    if (t.isStringLiteral(node)) {
      return node.value.trim() ? node.value.trim().split(/\s*,\s*/g) : [];
    } else if (t.isJSXExpressionContainer(node) &&
        t.isArrayExpression(node.expression)) {
      // array of string literals expected
      return node.expression.elements.map(expr => expr.value);
    } else {
      throw new Error("Unexpected type");
    }
  }

  function jSXAttribute(identifier, value) {
    return t.jSXAttribute(
      t.jSXIdentifier(identifier),
      typeof value === "string" ? t.stringLiteral(value) : t.jSXExpressionContainer(value)
    );
  }

  const translator = state => {
    const arg0 = () => t.identifier("message");

    return t.functionExpression(
      null, [ arg0() ],
      t.blockStatement([
        t.returnStatement(
          t.callExpression(
            t.identifier(getTranslator(state)),
            [ arg0() ]
          )
        )
      ])
    );
  };

  function complexTranslation(path, state) {
    const { node } = path;

    const [ i18nAttribute, filteredAttributes ] =
      partitionAttributes(node.openingElement.attributes);

    const newElement = stripElement(node, filteredAttributes);

    const msgId = () => t.jSXIdentifier(MESSAGE_IDENTIFIER);

    const placeholders = asList(i18nAttribute.value);

    const [ format, newChildren, expressions ] = extract(node, placeholders, normalizeWhitespace(state));

    const expressionsObject = t.objectExpression(
      placeholders.map((p, i) => t.objectProperty(
        t.identifier(p), expressions[i].expression
      ))
    );

    const msgAttributes = [
      jSXAttribute(FORMAT_ATTRIBUTE, format),
      jSXAttribute(COMPONENT_ATTRIBUTE, newElement),
      jSXAttribute(EXPRESSIONS_ATTRIBUTE, expressionsObject),
      jSXAttribute(TRANSLATOR_ATTRIBUTE, translator(state))
    ];

    return path.replaceWith(
      t.jSXElement(
        t.jSXOpeningElement(msgId(), msgAttributes, false),
        t.jSXClosingElement(msgId()),
        newChildren,
        false
      )
    );
  }

  const visitor = {
    const { node } = path;
    JSXElement(path, state) {
      if (hasI18nMsg(node)) {
        return complexTranslation(path, state);
      }
      else if (hasTranslatableText(node)) {
        return simpleTranslation(path, state);
      }
    },

    JSXAttribute(path, state) {
      const { node } = path;

      if (isTranslatableAttribute(node)) {
        return path.replaceWith(
          t.jSXAttribute(
            node.name,
            t.jSXExpressionContainer(translatedText(node.value.value, state))
          )
        );
      }
    }
  };

  return {
    inherits: jsx,
    visitor
  };
}
