/**
 * The language tag the web page declares for an app language.
 *
 * The app's key for Tunisian Arabic is `tn`, which as a BCP-47 tag is Setswana: a screen
 * reader or a translation prompt reading `<html lang="tn">` picks the wrong language for
 * an Arabic-script page. The key stays `tn` everywhere inside the app (resources, stored
 * preference, data fields); only what is published to the browser is the real tag.
 */
const HTML_LANG_TAGS: Readonly<Record<string, string>> = {
    tn: 'ar-TN',
};

export const htmlLangTag = (appLanguage: string): string => HTML_LANG_TAGS[appLanguage] ?? appLanguage;
