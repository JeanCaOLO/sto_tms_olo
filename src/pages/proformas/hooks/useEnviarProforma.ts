import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney } from '../../../lib/tarifas/format';
import {
  blobToBase64, buildEml, buildRecipients, fillTemplate, getCarrierEmail, getEmailConfig, gmailComposeUrl, markEmailSent,
  sendProformaDirect, type EmailConfig, type ProformaDetail,
} from '../../../lib/tarifas/proformas';
import { downloadBlob, renderProformaPdf } from '../lib/proformaPdf';

/** Prepara el correo de una proforma (destinatarios, asunto, mensaje) y las acciones para enviarlo. */
export function useEnviarProforma(detail: ProformaDetail, onSent: () => void) {
  const { proforma } = detail;
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [carrierEmail, setCarrierEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'edit' | 'opened'>('edit');
  const [via, setVia] = useState<'gmail' | 'eml'>('gmail');

  useEffect(() => {
    (async () => {
      try {
        const [cfg, email] = await Promise.all([getEmailConfig(proforma.countryId), getCarrierEmail(proforma.carrierId)]);
        const vars = { number: proforma.number, carrier: proforma.carrierName, total: formatMoney(String(proforma.totalAmount), proforma.currency) };
        setConfig(cfg);
        setCarrierEmail(email);
        setTo(buildRecipients(cfg.recipients, cfg.includeCarrierEmail, email).join(', '));
        setSubject(fillTemplate(cfg.subjectTemplate, vars));
        setBody(fillTemplate(cfg.bodyTemplate, vars));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo preparar el correo.');
      }
    })();
  }, [proforma]);

  const recipients = useMemo(() => buildRecipients(to.split(/[\s,;]+/), true, null), [to]);
  const fileName = `Proforma-${proforma.number}.pdf`;

  const downloadPdf = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      downloadBlob(await renderProformaPdf(detail), fileName);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setBusy(false);
    }
  }, [detail, fileName]);

  /** Manual: descarga el PDF y abre Gmail con el correo armado; el usuario lo adjunta y lo envía. */
  const openInGmail = useCallback(async () => {
    await downloadPdf();
    window.open(gmailComposeUrl({ to: recipients, subject, body }), '_blank', 'noopener');
    setVia('gmail');
    setStep('opened');
  }, [downloadPdf, recipients, subject, body]);

  /** Borrador .eml con el PDF ya ADJUNTO: se abre en Outlook/Mail listo para enviar. Gmail web no lo permite por enlace. */
  const downloadEml = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const pdfBase64 = await blobToBase64(await renderProformaPdf(detail));
      const eml = buildEml({ to: recipients, subject, body, attachment: { fileName, base64: pdfBase64 } });
      downloadBlob(new Blob([eml], { type: 'message/rfc822' }), `Proforma-${proforma.number}.eml`);
      setVia('eml');
      setStep('opened');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo armar el borrador.');
    } finally {
      setBusy(false);
    }
  }, [detail, recipients, subject, body, fileName, proforma.number]);

  /** Directo: el PDF viaja al servidor, que envía por Gmail con la cuenta conectada del usuario. */
  const sendDirect = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const pdfBase64 = await blobToBase64(await renderProformaPdf(detail));
      await sendProformaDirect({ proformaId: proforma.id, to: recipients, subject, body, pdfBase64, fileName });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar el correo.');
      setBusy(false);
      return;
    }
    // El correo ya salió: si falla dejar constancia, se avisa sin ocultar que se envió.
    const marked = await markEmailSent(proforma.id, recipients);
    setBusy(false);
    if (marked.error) setError(`El correo se envió, pero no se pudo registrar: ${marked.error}`);
    else onSent();
  }, [detail, proforma.id, recipients, subject, body, fileName, onSent]);

  const confirmSent = useCallback(async () => {
    setBusy(true);
    const result = await markEmailSent(proforma.id, recipients);
    setBusy(false);
    if (result.error) setError(result.error);
    else onSent();
  }, [proforma.id, recipients, onSent]);

  return {
    config, carrierEmail, to, setTo, subject, setSubject, body, setBody, recipients,
    busy, error, step, via, fileName, downloadPdf, openInGmail, downloadEml, sendDirect, confirmSent,
  };
}
