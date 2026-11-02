// Forest Apothecary: app start-up

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// Day-month date, e.g. "Monday 2 November"
function formatDate(d) {
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

document.getElementById('today-date').textContent = formatDate(new Date());

// The service worker saves the app on the phone so it opens with no internet
const status = document.getElementById('offline-status');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      status.textContent = 'Ready to open without internet';
      status.classList.add('ready');
    })
    .catch(() => {
      status.textContent = 'Offline mode could not be set up';
    });
} else {
  status.textContent = 'This browser cannot work offline';
}
