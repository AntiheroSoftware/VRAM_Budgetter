'use strict';

// Google Analytics behind a consent banner. Nothing is loaded and no cookie is set until
// the visitor clicks Accept; the choice is remembered and can be changed from "Cookies".

const GA_ID = 'G-NZHV314CLF';
const CONSENT_KEY = 'vramBudgetter.consent';  // 'granted' | 'denied'

// One-time move of a choice saved under the old app name (vramBudgeter.consent).
try {
  const old = localStorage.getItem('vramBudgeter.consent');
  if (old !== null && localStorage.getItem(CONSENT_KEY) === null) localStorage.setItem(CONSENT_KEY, old);
  localStorage.removeItem('vramBudgeter.consent');
} catch (_) { /* ignore */ }

window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
gtag('consent', 'default', {
  analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
});

let gaLoaded = false;

function getConsent() {
  try { return localStorage.getItem(CONSENT_KEY); } catch (_) { return null; }
}

function setConsent(value) {
  try { localStorage.setItem(CONSENT_KEY, value); } catch (_) { /* ignore */ }
}

function loadAnalytics() {
  gtag('consent', 'update', { analytics_storage: 'granted' });
  if (gaLoaded) return;
  gaLoaded = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  gtag('js', new Date());
  gtag('config', GA_ID);
}

// Withdrawing consent: stop collecting and remove the _ga cookies already set.
function stopAnalytics() {
  gtag('consent', 'update', { analytics_storage: 'denied' });
  const host = location.hostname.split('.');
  const domains = [''];
  for (let i = 0; i < host.length - 1; i++) domains.push('; domain=.' + host.slice(i).join('.'));
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0].trim();
    if (!name.startsWith('_ga')) continue;
    for (const d of domains) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
  }
}

function showBanner() {
  let banner = document.getElementById('consent');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'consent';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');
    banner.innerHTML = `
      <p>VRAM Budgetter uses Google Analytics cookies to count visits.
        Nothing is collected unless you accept. Your budgets never leave your browser.</p>
      <div class="consent-buttons">
        <button type="button" data-consent="denied">Decline</button>
        <button type="button" data-consent="granted" class="primary">Accept</button>
      </div>`;
    banner.addEventListener('click', e => {
      const value = e.target.dataset && e.target.dataset.consent;
      if (!value) return;
      setConsent(value);
      if (value === 'granted') loadAnalytics(); else stopAnalytics();
      banner.hidden = true;
    });
    document.body.appendChild(banner);
  }
  banner.hidden = false;
}

if (getConsent() === 'granted') loadAnalytics();

document.addEventListener('DOMContentLoaded', () => {
  if (!getConsent()) showBanner();
  const settings = document.getElementById('cookie-settings');
  if (settings) settings.addEventListener('click', showBanner);
});
