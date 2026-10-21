import { theme } from '../theme';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { shareAsync } from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { format } from 'date-fns';
import { Locale } from 'date-fns';
import { TFunction } from 'i18next';
import { Profile } from '../context/PregnancyContext';
import { createLogger } from '../utils/logger';
import { parseLocalDateKey, storedDateKey } from '../utils/localDate';
import { formatDecimal } from '../utils/localizedFormat';
import { escapeHtml } from '../utils/escapeHtml';

/** A stored LMP or due date names a calendar day: read it as that day, not as an instant
 *  (UTC midnight is the evening before west of UTC). */
const calendarDay = (iso: string): Date => {
    const date = new Date(iso);
    return parseLocalDateKey(storedDateKey(date)) ?? date;
};

const log = createLogger('PDFExportService');

interface JournalData {
    profile: Profile;
    weightHistory: { date: string; weight: number }[];
    appointments: { date: string; title: string; doctor?: string; notes?: string }[];
    notes: { date: string; content: string }[];
}

const generateHTML = (data: JournalData, t: TFunction, locale: Locale, langCode: string = 'fr') => {
    const { profile, weightHistory, appointments, notes } = data;
    const today = format(new Date(), 'd MMMM yyyy', { locale });
    const displayName = escapeHtml(profile.firstName || t('home.futureMom'));
    const isRTL = langCode === 'ar' || langCode === 'tn';

    // Sort data
    const sortedWeight = [...weightHistory].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedApps = [...appointments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const sortedNotes = notes ? [...notes].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) : [];

    return `
    <!DOCTYPE html>
    <html lang="${langCode}" dir="${isRTL ? 'rtl' : 'ltr'}">
    <head>
        <meta charset="utf-8">
        <title>${t('pdf.title')} - ${displayName}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            /* Google Fonts with system fallback for offline */
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;700&display=swap');

            :root {
                --primary: ${theme.colors.primary};
                --primary-dark: ${theme.colors.accent};
                --primary-light: ${theme.colors.border};
                --bg: ${theme.colors.background};
                --text: ${theme.colors.text};
                --text-light: ${theme.colors.textLight};
                --white: ${theme.colors.white};
                --shadow: ${theme.shadows.pdfRoot};
            }

            * { box-sizing: border-box; }

            body {
                font-family: 'Outfit', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;
                color: var(--text);
                background-color: ${theme.colors.white};
                margin: 0;
                padding: 0;
                line-height: 1.6;
            }

            /* Header Section with Gradient */
            .header-banner {
                background: linear-gradient(135deg, ${theme.colors.primary} 0%, ${theme.colors.accent} 100%);
                color: white;
                padding: 40px 40px 60px;
                border-bottom-left-radius: 40px;
                border-bottom-right-radius: 40px;
                text-align: center;
                margin-bottom: -30px; /* Overlap effect */
                box-shadow: ${theme.shadows.pdfHeader};
            }

            .app-brand {
                font-size: 14px;
                text-transform: uppercase;
                letter-spacing: 2px;
                opacity: 0.8;
                margin-bottom: 10px;
            }

            h1 {
                font-size: 32px;
                margin: 0;
                font-weight: 700;
            }

            .subtitle {
                font-size: 16px;
                opacity: 0.95;
                margin-top: 8px;
            }

            /* Main Content Container */
            .container {
                max-width: 800px;
                margin: 0 auto;
                padding: 0 20px 40px;
            }

            /* Generic Card Style */
            .card {
                background: white;
                border-radius: 16px;
                padding: 24px;
                margin-bottom: 24px;
                box-shadow: var(--shadow);
                border: 1px solid ${theme.colors.whiteAlpha50};
            }

            /* Section Headers within Content */
            h2 {
                color: var(--primary-dark);
                font-size: 20px;
                margin-top: 0;
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 2px solid var(--bg);
                padding-bottom: 8px;
            }

            h2 .icon { font-size: 24px; }

            /* Profile Info Grid */
            .profile-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            .profile-item {
                background: var(--bg);
                padding: 12px 16px;
                border-radius: 12px;
            }
            .profile-label {
                font-size: 11px;
                text-transform: uppercase;
                color: var(--text-light);
                font-weight: 600;
                letter-spacing: 0.5px;
            }
            .profile-value {
                font-size: 16px;
                font-weight: 500;
                color: var(--primary-dark);
                margin-top: 4px;
            }

            /* Tables */
            table {
                width: 100%;
                border-collapse: separate;
                border-spacing: 0;
                margin-top: 10px;
                font-size: 14px;
            }
            th {
                background: var(--bg);
                color: var(--primary-dark);
                font-weight: 600;
                text-align: start; /* follows dir=rtl: the body cells already do */
                padding: 12px;
                border-top-left-radius: 8px;
                border-top-right-radius: 8px;
            }
            td {
                padding: 12px;
                border-bottom: 1px solid ${theme.colors.borderLight};
                color: var(--text);
            }
            tr:last-child td {
                border-bottom: none;
            }
            tr:nth-child(even) td {
                background: ${theme.colors.surfaceRowZebra};
            }
            
            /* Notes Section */
            .note-item {
                margin-bottom: 16px;
                padding-bottom: 16px;
                border-bottom: 1px dashed var(--primary-light);
            }
            .note-date {
                font-size: 12px;
                color: var(--primary);
                font-weight: 600;
                margin-bottom: 4px;
            }
            .note-content {
                font-size: 14px;
                color: var(--text);
                background: ${theme.colors.surfaceStickyNote}; /* Post-it feel */
                padding: 10px;
                border-radius: 8px;
                border-left: 3px solid ${theme.colors.amber300};
            }

            /* Footer */
            .footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid ${theme.colors.borderLight};
                color: var(--text-light);
                font-size: 12px;
            }
            .heart { color: var(--primary); }

            /* Empty States */
            .empty-state {
                font-style: italic;
                color: var(--text-light);
                text-align: center;
                padding: 20px;
                background: ${theme.colors.surfaceGrayStripe};
                border-radius: 12px;
            }
        </style>
    </head>
    <body>
        <div class="header-banner">
            <div class="app-brand">Mama & Bébé</div>
            <h1>${t('pdf.title')}</h1>
            <div class="subtitle">${t('pdf.generated', { date: today })} • ${displayName}</div>
        </div>

        <div class="container">
            <!-- Profile Card -->
            <div class="card" style="margin-top: 0; position: relative; z-index: 10;">
                <h2><span class="icon">🤰</span> ${t('pdf.profile')}</h2>
                <div class="profile-grid">
                    <div class="profile-item">
                        <div class="profile-label">${t('pdf.name')}</div>
                        <div class="profile-value">${escapeHtml(profile.firstName || '-')} ${escapeHtml(profile.lastName || '')}</div>
                    </div>
                    <div class="profile-item">
                        <div class="profile-label">${t('pdf.country')}</div>
                        <div class="profile-value">${profile.country ? escapeHtml(t(`common.countries.${profile.country}`, { defaultValue: profile.country })) : '-'}</div>
                    </div>
                    ${profile.lmp ? `
                    <div class="profile-item">
                        <div class="profile-label">${t('pdf.lmp')}</div>
                        <div class="profile-value">${format(calendarDay(profile.lmp), 'd MMMM yyyy', { locale })}</div>
                    </div>` : ''}
                    ${profile.dpa ? `
                    <div class="profile-item">
                        <div class="profile-label">${t('pdf.dpa')}</div>
                        <div class="profile-value">${format(calendarDay(profile.dpa), 'd MMMM yyyy', { locale })}</div>
                    </div>` : ''}
                </div>
            </div>

            <!-- Weight Section -->
            <div class="card">
                <h2><span class="icon">⚖️</span> ${t('pdf.weightHistory')}</h2>
                ${sortedWeight.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th width="40%">${t('pdf.date')}</th>
                            <th width="60%">${t('pdf.weight')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedWeight.map(w => `
                        <tr>
                            <td>${format(new Date(w.date), 'd MMMM yyyy', { locale })}</td>
                            <td><strong><span dir="ltr">${formatDecimal(w.weight, langCode, 1)}&nbsp;kg</span></strong></td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : `<div class="empty-state">${t('pdf.emptyWeight')}</div>`}
            </div>

            <!-- Appointments Section -->
            <div class="card">
                <h2><span class="icon">📅</span> ${t('pdf.appointments')}</h2>
                ${sortedApps.length > 0 ? `
                <table>
                    <thead>
                        <tr>
                            <th width="30%">${t('pdf.date')}</th>
                            <th width="30%">${t('pdf.apptTitle')}</th>
                            <th width="40%">${t('pdf.notes')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sortedApps.map(a => `
                        <tr>
                            <td>${format(new Date(a.date), 'd MMMM yyyy HH:mm', { locale })}</td>
                            <td><span style="color: var(--primary-dark); font-weight: 500;">${escapeHtml(a.title)}</span></td>
                            <td style="font-size: 13px; color: ${theme.colors.textSecondary};">${escapeHtml(a.notes || '-')}</td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
                ` : `<div class="empty-state">${t('pdf.emptyAppts')}</div>`}
            </div>

            <!-- Notes Section (Optional) -->
            ${sortedNotes.length > 0 ? `
            <div class="card">
                <h2><span class="icon">📝</span> ${t('pdf.personalNotes')}</h2>
                ${sortedNotes.map(n => `
                <div class="note-item">
                    <div class="note-date">${format(new Date(n.date), 'd MMMM yyyy HH:mm', { locale })}</div>
                    <div class="note-content">${escapeHtml(n.content)}</div>
                </div>
                `).join('')}
            </div>
            ` : ''}

            <div class="footer">
                ${t('pdf.footer')}<br>
                ${t('pdf.care')} <span class="heart">❤️</span>
            </div>
        </div>
    </body>
    </html>
    `;
};

/**
 * Web: expo-print's printToFileAsync prints the current page and resolves to nothing, so the
 * export crashed on `{ uri }` and the user got an error. Print the journal itself from a
 * hidden frame instead — the browser's print dialog offers "Save as PDF".
 */
const printJournalOnWeb = async (html: string) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const win = frame.contentWindow;
    if (!win) {
        frame.remove();
        throw new Error('Print frame unavailable');
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    // Let the frame lay the journal out before the dialog snapshots it.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const cleanup = () => frame.remove();
    win.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 60_000);
    win.focus();
    win.print();
};

export const generateAndSharePDF = async (data: JournalData, t: TFunction, locale: Locale, fileName: string = 'Journal_Grossesse.pdf', langCode: string = 'fr') => {
    try {
        log.info('Generating PDF with premium design...');
        const html = generateHTML(data, t, locale, langCode);
        if (Platform.OS === 'web') {
            await printJournalOnWeb(html);
            return;
        }
        const { uri } = await Print.printToFileAsync({
            html,
            base64: false
        });

        log.info('PDF generated at:', uri);

        // P3.5 FIX: was `if (await shareAsync)` which awaits the function reference (always truthy)
        // → "sharing not available" branch was dead. Use the SDK availability probe.
        try {
            if (await Sharing.isAvailableAsync()) {
                await shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: fileName });
            } else {
                log.warn('Sharing is not available on this platform');
            }
        } finally {
            // The journal is health data; the share sheet has its own copy by now, and the
            // generated file otherwise stayed on the phone indefinitely.
            await FileSystem.deleteAsync(uri, { idempotent: true }).catch((e: unknown) =>
                log.warn('Could not remove the temporary PDF', e),
            );
        }

    } catch (error) {
        log.error('Error generating PDF:', error);
        throw error;
    }
};
