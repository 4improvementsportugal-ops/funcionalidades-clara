/* Nº5 Clara | Funcionalidades: formulário de pré-reserva, igual ao da página principal.
   Valida os dados, envia a inscrição ao GoHighLevel (o mesmo webhook) e segue para o pagamento na Stripe.
   Nada aqui é secreto: o Payment Link e o webhook de entrada só aceitam dados. Nunca ponhas chaves de API. */
(() => {
  'use strict';
  const LINK_PRE_RESERVA = 'https://buy.stripe.com/8x2fZjalbfgP4rZcaqgrS0b';
  const WEBHOOK_INSCRICAO = 'https://services.leadconnectorhq.com/hooks/edKb7bpIXSA838eQDrMd/webhook-trigger/fuo4k7EhouwDloxpHGHn';

  /* Passa a Clara: cada pessoa tem um código de 6 letras; quem chega por ?ref=CÓDIGO fica com ele guardado 30 dias */
  const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const FORMATO = /^[A-HJ-NP-Z2-9]{6}$/;
  const K_MEU = 'n5-passa-codigo', K_REF = 'n5-passa-ref', VALIDADE_REF = 30 * 24 * 3600 * 1000;
  const lerLS = k => { try { return window.localStorage.getItem(k); } catch (_) { return null; } };
  const gravarLS = (k, v) => { try { window.localStorage.setItem(k, v); } catch (_) {} };
  const normalizar = c => String(c || '').trim().toUpperCase();
  const codigoValido = c => FORMATO.test(normalizar(c));
  const novoCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALFABETO[b % 32]).join('');
  function meuCodigo() {
    const c = lerLS(K_MEU);
    if (codigoValido(c)) return normalizar(c);
    const novo = novoCodigo();
    gravarLS(K_MEU, novo);
    return novo;
  }
  function refGuardado() {
    try {
      const r = JSON.parse(lerLS(K_REF) || 'null');
      return r && codigoValido(r.codigo) && Date.now() - r.em < VALIDADE_REF ? normalizar(r.codigo) : null;
    } catch (_) { return null; }
  }
  try {
    const r = normalizar(new URLSearchParams(window.location.search).get('ref'));
    if (codigoValido(r) && r !== normalizar(lerLS(K_MEU))) gravarLS(K_REF, JSON.stringify({ codigo: r, em: Date.now() }));
  } catch (_) {}
  const $ = (selector, root = document) => root.querySelector(selector);

  {
    const form = $('#lead-form');
    const inputs = {
      name: $('#lead-name'), email: $('#lead-email'), phone: $('#lead-phone'), consent: $('#consent')
    };
    const errors = {
      name: $('#error-name'), email: $('#error-email'), phone: $('#error-phone'), consent: $('#error-consent')
    };
    function setError(field, message) {
      errors[field].textContent = message;
      if (inputs[field].type !== 'checkbox') inputs[field].setAttribute('aria-invalid', String(Boolean(message)));
    }
    function validate() {
      Object.keys(errors).forEach(key => setError(key, ''));
      let valid = true;
      const name = inputs.name.value.trim().replace(/\s+/g, ' ');
      const email = inputs.email.value.trim();
      const phone = inputs.phone.value.trim();
      const digits = phone.replace(/\D/g, '');
      if (name.length < 2) { setError('name', 'Introduz o teu nome.'); valid = false; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setError('email', 'Introduz um email válido.'); valid = false; }
      if (digits.length < 9 || digits.length > 15) { setError('phone', 'Introduz um número de telefone válido, com indicativo se necessário.'); valid = false; }
      if (!inputs.consent.checked) { setError('consent', 'É necessário ler e aceitar a informação indicada para continuar.'); valid = false; }
      return valid ? { nome: name, email, telefone: phone } : null;
    }
    form?.addEventListener('submit', event => {
      event.preventDefault();
      $('#form-alert').hidden = true;
      const lead = validate();
      if (!lead) {
        const invalid = form.querySelector('[aria-invalid="true"]') || (!inputs.consent.checked && inputs.consent);
        invalid?.focus();
        return;
      }
      const meu = meuCodigo();
      let ref = refGuardado();
      if (ref === meu) ref = null;
      const destino = new URL(LINK_PRE_RESERVA);
      destino.searchParams.set('prefilled_email', lead.email);
      if (ref) destino.searchParams.set('client_reference_id', ref);
      const seguir = () => window.location.assign(destino.toString());
      if (!WEBHOOK_INSCRICAO) { seguir(); return; }
      const eventId = 'lead_' + Date.now() + '_' + meu;
      const corpo = JSON.stringify({ nome: lead.nome, email: lead.email, telefone: lead.telefone, codigo: meu, indicado_por: ref || '', consentimento: 'sim', origem: window.location.href, event_id: eventId, timestamp: new Date().toISOString() });
      const botao = form.querySelector('[type="submit"]');
      if (botao) botao.disabled = true;
      /* Meta Pixel: Lead (só é enviado com os cookies de marketing aceites, ver pixel.js) */
      window.N5Pixel?.track('Lead', { content_name: 'Pré-reserva Nº5 Clara' }, { eventID: eventId });
      window.N5Posthog?.track('pre_reserva_formulario_enviado', { com_indicacao: !!ref });
      /* envia para o GHL (JSON, senão o mapping do gatilho fica vazio) e segue para a Stripe;
         se o GHL falhar ou demorar, o pagamento não fica bloqueado */
      Promise.race([
        fetch(WEBHOOK_INSCRICAO, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo }).catch(() => {}),
        new Promise(r => setTimeout(r, 3000)),
      ]).then(seguir);
    });
  }
})();
