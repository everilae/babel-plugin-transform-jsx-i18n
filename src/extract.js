#!//usr/bin/env node
import traverse from "babel-traverse";
import * as babylon from "babylon";
import * as t from "babel-types";
import * as fs from "fs";
import * as u from "./utils";
import * as c from "./common";
import LocalizerError from "./LocalizerError";
import * as gettextParser from "gettext-parser";

function textToMessage(text) {
  return text.trim().replace(/\s+/g, " ");
}

function extractMessages(node) {
  return node.children.
    filter(u.isTranslatableText).
    map(child => textToMessage(child.value));
}

function extractFormat(node) {
  const [ i18nAttribute ] =
    u.partitionAttributes(node.openingElement.attributes);

  const placeholders = u.asList(i18nAttribute.value);

  // FIXME: Make whitespace normalization configurable
  const { format } = u.extract(node, placeholders, true);

  return format;
}

function jSXElement(path, catalog) {
  const { node } = path;

  if (u.isBlacklisted(path) || u.hasLang(path)) {
    path.skip();
    return;
  }

  try {
    if (u.hasAttribute(node, c.I18N_MSG_ATTRIBUTE)) {
      const format = extractFormat(node);
      catalog[format] = format;
      // This keeps possible children from being processed.
      path.skip();
    }
    else if (u.hasTranslatableText(node)) {
      extractMessages(node).forEach(msg => catalog[msg] = msg);
    }
  } catch (error) {
    if (error instanceof LocalizerError) {
      throw path.buildCodeFrameError(error.message);
    } else {
      // Rethrow
      throw error;
    }
  }
}

function jSXAttribute(path, catalog) {
  const { node } = path;
  if (!u.hasLang(path) && u.isTranslatableAttribute(node)) {
    const msg = textToMessage(node.value.value);
    catalog[msg] = msg;
  }
}

function visitor(catalog) {
  return {
    enter(path) {
      if (path.isJSXElement()) {
        jSXElement(path, catalog);
      } else if (path.isJSXAttribute()) {
        jSXAttribute(path, catalog);
      }
    }
  };
}

function parseAndExtract(source) {
  const ast = babylon.parse(source, {
    sourceType: "module",
    plugins: [ "jsx" ]
  });
  let catalog = {}
  traverse(ast, visitor(catalog));
  return catalog;
}

function makeTranslationObject(catalog) {
  return {
    charset: "utf-8",
    headers: {
      "mime-version": "1.0",
      "content-type": "text/plain; charset=UTF-8",
      "content-transfer-encoding": "8bit"
    },
    translations: {
      "": Object.keys(catalog).reduce((obj, key) => {
        obj[key] = {
          msgid: key,
          msgstr: [ catalog[key] ]
        };
        return obj;
      }, {})
    }
  };
}

function main(encoding="utf-8") {
  const readFile = u.promisify(fs.readFile);
  const fileNames = process.argv.slice(
    process.argv[0].endsWith("node") ? 2 : 1);

  Promise.all(fileNames.map(fileName => readFile(fileName, encoding))).
    then(sources => {
      const catalogs = sources.map(parseAndExtract);
      const catalog = Object.assign(...catalogs);
      const translationObj = makeTranslationObject(catalog);
      const po = gettextParser.po.compile(translationObj);
      process.stdout.write(po);
    });
}

if (require.main === module) {
  main();
}
