import jsx from "babel-plugin-syntax-jsx";

const RUNTIME_MODULE_IDENTIFIER = "babel-plugin-transform-jsx-localize";

const TRANSLATOR_IDENTIFIER = "gettext";
const MESSAGE_IDENTIFIER = "Message"; 
const LOCAL_MESSAGE_IDENTIFIER_KEY = "localMessageIdentifier";

const I18N_MSG_ATTRIBUTE = "i18nMsg";
const FORMAT_ATTRIBUTE = "format";
const COMPONENT_ATTRIBUTE = "component";
const EXPRESSIONS_ATTRIBUTE = "expressions";
const TRANSLATOR_ATTRIBUTE = "translator";
const LANG_ATTRIBUTE = "lang";

const TRANSLATABLE_ATTRIBUTES = [
  "alt",
  "placeholder",
  "title"
];

const ELEMENT_TYPE_BLACKLIST = [
  // As to why would anyone have inline styles in React...
  "style",
  "code"
];

export { default as Message } from './Message';

function normalizeWhitespace(state) {
  const normWs = state.opts.normalizeWhitespace;
  return normWs != null ? normWs : true;
}

// For instanceof compatibility
function LocalizerError(message) {
  this.message = message;
  this.stack = (new Error()).stack;
}

LocalizerError.prototype = new Error();

function any(iterable, pred) {
  for (const it of iterable) {
    if (pred(it)) {
      return true;
    }
  }

  return false;
}

export default function ({ types: t }) {
  function getTranslator(state) {
    const identifier = state.opts.translator || TRANSLATOR_IDENTIFIER;
    return identifier.split(".").
      map(name => name === "this" ? t.thisExpression() : t.identifier(name)).
      reduce((obj, prop) => t.memberExpression(obj, prop));
  }

  function isBlacklisted(path) {
    return Boolean(
      path.find(path => path.isJSXElement() &&
        t.isIdentifier(path.node.openingElement.name) &&
        ELEMENT_TYPE_BLACKLIST.includes(path.node.openingElement.name.name))
    );
  }

  function hasLang(path) {
    return Boolean(
      path.find(path => {
        if (!path.isJSXElement()) {
          return false;
        }

        return any(
          path.node.openingElement.attributes,
          attribute => t.isJSXAttribute(attribute) &&
            t.isJSXIdentifier(attribute.name) &&
            attribute.name.name === LANG_ATTRIBUTE
        );
      })
    );
  }

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
    let [ , leadingWs, messageId, trailingWs ] =
      /^(\s*)((?:.|\s)+?)(\s*)$/.exec(text);

    if (normalizeWhitespace(state)) {
      leadingWs = leadingWs && " ";
      trailingWs = trailingWs && " ";
      messageId = messageId.replace(/\s+/g, " ");
    }

    const translation = t.callExpression(
      getTranslator(state),
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

    path.replaceWith(
      t.jSXElement(
        node.openingElement,
        node.closingElement,
        newChildren,
        node.selfClosing
      )
    );
  }

  function hasAttribute(node, name) {
    return any(
      node.openingElement.attributes,
      attribute => (
        t.isJSXAttribute(attribute) &&
        t.isJSXIdentifier(attribute.name) &&
        attribute.name.name === name
      )
    );
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
        const fmt = extract(child, placeholders, normalizeWs, elements,
                            expressions).format;
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

    return { format, elements, expressions };
  }

  function asList(node, path) {
    if (t.isStringLiteral(node)) {
      return node.value.trim() ? node.value.trim().split(/\s*,\s*/g) : [];
    } else if (t.isJSXExpressionContainer(node) &&
        t.isArrayExpression(node.expression)) {
      // array of string literals expected
      return node.expression.elements.map(expr => expr.value);
    } else {
      throw new LocalizerError("i18nMsg attribute must be string or array of string");
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
            getTranslator(state),
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

    const msgId = t.jSXIdentifier(state.get(LOCAL_MESSAGE_IDENTIFIER_KEY).name);

    const placeholders = asList(i18nAttribute.value);

    const { format, elements: newChildren, expressions } =
      extract(node, placeholders, normalizeWhitespace(state));

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
        t.jSXOpeningElement(msgId, msgAttributes, false),
        t.jSXClosingElement(msgId),
        newChildren,
        false
      )
    );
  }

  const IMPORT_INJECTED = "messageImportInjected";

  function injectRuntimeImportsIfNeeded(path, state) {
    if (state.get(IMPORT_INJECTED)) {
      return;
    }

    state.set(IMPORT_INJECTED, true);

    const programPath = path.findParent(path => path.isProgram());
    const { node } = programPath;

    const msgId = () => t.identifier(MESSAGE_IDENTIFIER);
    const localMsgId = programPath.scope.generateUidIdentifier("Message");
    state.set(LOCAL_MESSAGE_IDENTIFIER_KEY, localMsgId);

    programPath.unshiftContainer(
      'body',
      t.importDeclaration(
        [ t.importSpecifier(localMsgId, msgId()) ],
        t.stringLiteral(RUNTIME_MODULE_IDENTIFIER)
      )
    );
  }

  const visitor = {
    JSXElement(path, state) {
      const { node } = path;

      if (isBlacklisted(path) || hasLang(path)) {
        return;
      }

      try {
        if (hasAttribute(node, I18N_MSG_ATTRIBUTE)) {
          injectRuntimeImportsIfNeeded(path, state);
          complexTranslation(path, state);
        }
        else if (hasTranslatableText(node)) {
          simpleTranslation(path, state);
        }
      } catch (error) {
        if (error instanceof LocalizerError) {
          throw path.buildCodeFrameError(error.message);
        } else {
          // Rethrow
          throw error;
        }
      }
    },

    JSXAttribute(path, state) {
      const { node } = path;

      if (!hasLang(path) && isTranslatableAttribute(node)) {
        path.replaceWith(
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
