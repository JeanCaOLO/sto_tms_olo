// Las pruebas buscan los textos en español: se fija el idioma antes de cada archivo de prueba
// (sin esto, el detector de idioma del navegador de jsdom elegiría inglés).

import i18n from '../i18n';

await i18n.changeLanguage('es');
