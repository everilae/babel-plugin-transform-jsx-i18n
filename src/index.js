import jsx from "@babel/plugin-syntax-jsx";
import * as u from './utils';
import * as c from './common';
import LocalizerError from "./LocalizerError";

const RUNTIME_MODULE_IDENTIFIER = "jsx-i18n-message";

const TRANSLATOR_IDENTIFIER = "gettext";
const MESSAGE_IDENTIFIER = "Message";
const LOCAL_MESSAGE_IDENTIFIER_KEY = "localMessageIdentifier";

function normalizeWhitespace(state) {
  const normWs = state.opts.normalizeWhitespace;
  return normWs != null ? normWs : true;
}

export default function ({ types: t }) {
  function resolveDottedIdentifier(name) {
    return name.split(".").
      map(name => name === "this" ? t.thisExpression() : t.identifier(name)).
      reduce((obj, prop) => t.memberExpression(obj, prop));
  }

  function getTranslator(state) {
    const identifier = state.opts.translator || TRANSLATOR_IDENTIFIER;
    return resolveDottedIdentifier(identifier);
  }

  function getFormatTranslator(state) {
    const identifier = state.opts.messageFormatTranslator;
    if (identifier != null) {
      return resolveDottedIdentifier(identifier);
    } else {
      return getTranslator(state);
    }
  }

  function translatedText(text, state) {
    const {
      leadingWs,
      messageId,
      trailingWs
    } = u.getMessageId(text, normalizeWhitespace(state));

    const translation = t.callExpression(
      getTranslator(state),
      [ t.stringLiteral(messageId) ]
    );

    // Special case
    if (!leadingWs && !trailingWs) {
      return translation;
    }

    return u.add(
      t.stringLiteral(leadingWs),
      translation,
      t.stringLiteral(trailingWs)
    );
  }

  function simpleTranslation(path, state) {
    const { node } = path;

    const newChildren = node.children.map(child => {
      if (u.isTranslatableText(child)) {
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

  function complexTranslation(path, state) {
    const { node } = path;

    const {
      msg: i18nAttribute,
      rest: filteredAttributes
    } = u.getI18nAttributes(node.openingElement.attributes);

    const newElement = u.stripElement(node, filteredAttributes);

    const msgId = t.jSXIdentifier(state.get(LOCAL_MESSAGE_IDENTIFIER_KEY).name);

    const placeholders = u.asList(i18nAttribute.value);

    const {
      format,
      leadingWs,
      trailingWs,
      elements: newChildren,
      expressions
    } = u.extractMessage(node, placeholders, normalizeWhitespace(state));

    const expressionsObject = t.objectExpression(
      placeholders.map((p, i) => t.objectProperty(
        t.identifier(p), expressions[i].expression
      ))
    );

    const translatedFormat = t.callExpression(
      getFormatTranslator(state),
      [ t.stringLiteral(format) ]
    );

    const translatedFormatWithWs = leadingWs || trailingWs
      ? u.add(
          t.stringLiteral(leadingWs),
          translatedFormat,
          t.stringLiteral(trailingWs)
        )
      : translatedFormat;

    const msgAttributes = [
      u.jSXAttribute(c.FORMAT_ATTRIBUTE, translatedFormatWithWs),
      u.jSXAttribute(c.COMPONENT_ATTRIBUTE, newElement),
      u.jSXAttribute(c.EXPRESSIONS_ATTRIBUTE, expressionsObject)
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
    const localMsgId = programPath.scope.generateUidIdentifier(MESSAGE_IDENTIFIER);
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

      if (u.isBlacklisted(path) || u.hasLang(path)) {
        return;
      }

      try {
        if (u.hasAttribute(node, c.I18N_MSG_ATTRIBUTE)) {
          injectRuntimeImportsIfNeeded(path, state);
          complexTranslation(path, state);
        }
        else if (u.hasTranslatableText(node)) {
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

      if (!u.hasLang(path) && u.isTranslatableAttribute(node)) {
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
