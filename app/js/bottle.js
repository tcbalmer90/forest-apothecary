// The little corked potion bottle drawn for each medicine

export const COLOURS = {
  amber: '#B5873F',
  sage: '#7E8F5E',
  toadstool: '#9C4A3A',
  dusk: '#6B7C8F',
};

export function bottleSVG(colour = 'amber', { empty = false } = {}) {
  const fill = empty ? 'none' : (COLOURS[colour] || COLOURS.amber);
  return `
    <svg class="bottle" viewBox="0 0 60 84" aria-hidden="true">
      <rect x="22" y="2" width="16" height="12" rx="3" fill="#A88A5A" stroke="#E9DFC7" stroke-width="2"/>
      <path d="M24 14h12v12c11 4 18 13 18 25c0 16-11 29-24 29s-24-13-24-29c0-12 7-21 18-25z"
            fill="${fill}" stroke="#E9DFC7" stroke-width="2.5" stroke-linejoin="round"/>
      ${empty
        ? '<circle cx="22" cy="55" r="2.5" fill="#E9DFC7"/><circle cx="30" cy="55" r="2.5" fill="#E9DFC7"/><circle cx="38" cy="55" r="2.5" fill="#E9DFC7"/>'
        : `<rect x="15" y="47" width="30" height="16" rx="2" fill="#E9DFC7"/>
           <path d="M20 55h20" stroke="${fill}" stroke-width="2" stroke-linecap="round"/>
           <path d="M13 52c0-8 3-14 8-18" fill="none" stroke="#E9DFC7" stroke-width="2" stroke-linecap="round" opacity="0.5"/>`}
    </svg>`;
}
