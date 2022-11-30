#!/usr/bin/env node
import traverse from "@babel/traverse";
import * as parser from "@babel/parser";
import * as babel from "@babel/core";
import * as t from "@babel/types";
import * as fs from "fs";
import * as u from "./utils";
import * as c from "./common";
import LocalizerError from "./LocalizerError";
import * as gettextParser from "gettext-parser";
import transformJsxI18n from ".";

function textToMessage(text) {
  return u.getMessageId(text).messageId;
}

function extractMessages(node) {
  return node.children.
    filter(u.isTranslatableText).
    map(child => textToMessage(child.value));
}

function extractFormat(node, config) {
  const {
    msg: i18nAttribute,
    comment
  } = u.getI18nAttributes(node.openingElement.attributes);

  const placeholders = u.asList(i18nAttribute.value);

  const { format } = u.extractMessage(
    node, placeholders, config.normalizeWhitespace);

  return { format, comment: comment && comment.value.value };
}

function makeMessage(path, message, filename, comment) {
  let msg = {
    msgid: message,
    msgstr: [],
    comments: {
      reference: `${filename}:${path.node.loc.start.line}`
    }
  }

  if (comment) {
    msg.comments.extracted = comment;
  }

  return msg;
}

function visitJSXElement(filename, catalog, config) {
  return path => {
    const { node } = path;

    if (u.isBlacklisted(path) || u.hasLang(path)) {
      path.skip();
      return;
    }

    try {
      if (u.hasAttribute(node, c.I18N_MSG_ATTRIBUTE)) {
        const { format, comment } = extractFormat(node, config);
        catalog[format] = makeMessage(path, format, filename, comment);
        // This keeps possible children from being processed.
        path.skip();
      }
      else if (u.hasTranslatableText(node)) {
        extractMessages(node).
          forEach(msg => catalog[msg] = makeMessage(path, msg, filename));
      }
    } catch (error) {
      if (error instanceof LocalizerError) {
        throw path.buildCodeFrameError(error.message);
      } else {
        // Rethrow
        throw error;
      }
    }
  };
}

function visitJSXAttribute(filename, catalog, config) {
  return path => {
    const { node } = path;
    if (!u.hasLang(path) && u.isTranslatableAttribute(node)) {
      const msg = textToMessage(node.value.value);
      catalog[msg] = makeMessage(path, msg, filename);
    }
  };
}

function visitCallExpression(filename, catalog, config) {
  return path => {
    const { node } = path;
    if (u.equalsDottedIdentifier(node.callee, config.translator)) {
      t.assertStringLiteral(node.arguments[0]);
      const msg = node.arguments[0].value;
      catalog[msg] = makeMessage(path, msg, filename);
    }
  };
}

function visitor(filename, catalog, config) {
  return {
    JSXElement: visitJSXElement(filename, catalog, config),
    JSXAttribute: visitJSXAttribute(filename, catalog, config),
    CallExpression: visitCallExpression(filename, catalog, config)
  };
}

function parseAndExtract([ filename, source ]) {
  const config = readConfig(filename);
  const ast = parser.parse(source, {
    sourceType: "module",
    plugins: [ "jsx" ]
  });
  let catalog = {}
  traverse(ast, visitor(filename, catalog, config));
  return catalog;
}

function makeTranslationObject(catalog) {
  return {
    charset: "utf-8",
    headers: {
      "POT-Creation-Date": (new Date()).toISOString()
    },
    translations: {
      "": catalog
    }
  };
}

function main(encoding="utf-8") {
  const readFile = u.promisify(fs.readFile);
  const filenames = process.argv.slice(
    process.argv[0].endsWith("node") ? 2 : 1);

  let sources = filenames.
    map(filename => readFile(filename, encoding).
      then(source => [filename, source]));

  Promise.all(sources).
    then(sources => {
      const catalogs = sources.map(parseAndExtract);
      const catalog = Object.assign(...catalogs);
      const translationObj = makeTranslationObject(catalog);
      const po = gettextParser.po.compile(translationObj);
      process.stdout.write(po);
      process.stdout.write("\n");
    });
}

const defaultConfig = {
  translator: c.TRANSLATOR_IDENTIFIER_DEFAULT,
  normalizeWhitespace: c.NORMALIZE_WHITESPACE_DEFAULT
};

function readConfig(filename) {
  const { options: { plugins } } = babel.loadPartialConfig({
    filename
  });

  let options;

  for (const plugin of plugins) {
    if (plugin.value === transformJsxI18n) {
      options = plugin.options;
      break;
    }
  }

  return Object.assign({}, defaultConfig, options);
}

if (require.main === module) {
  main();
}
