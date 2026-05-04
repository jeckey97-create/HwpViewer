const { createHancomConverter } = require('./hancomConverter');
const { createLibreOfficeConverter } = require('./libreOfficeConverter');

function createDocumentConverter(context) {
  // Converter interface: {name, convertToPdf(inputPath): Promise<string>}
  // Later engines can be selected here, e.g. externalConverter.
  if (process.env.DOCUMENT_CONVERTER_ENGINE === 'libreoffice') {
    return createLibreOfficeConverter(context);
  }

  return createHancomConverter(context);
}

module.exports = { createDocumentConverter };
