export function matches(product, filters) {
  return (!filters.age || product.age === filters.age)
    && (!filters.gender || product.gender.includes(filters.gender))
    && (!filters.color || product.colors.includes(filters.color));
}

if (typeof document !== 'undefined') {
  const products = JSON.parse(document.getElementById('collection-data').textContent);
  const form = document.getElementById('filters');
  const fields = ['age', 'gender', 'color'];
  const cards = [...document.querySelectorAll('[data-design]')];
  function readURL() {
    const query = new URLSearchParams(location.search);
    for (const name of fields) {
      const select = form.elements.namedItem(name);
      const value = query.get(name) || '';
      select.value = [...select.options].some(option => option.value === value) ? value : '';
    }
  }
  function render(updateURL = true) {
    const filters = Object.fromEntries(fields.map(name => [name, form.elements.namedItem(name).value]));
    const visible = new Set(products.filter(product => matches(product, filters)).map(product => product.slug));
    cards.forEach(card => { card.hidden = !visible.has(card.dataset.design); });
    document.getElementById('result-count').textContent = `${visible.size} of ${products.length} designs`;
    document.getElementById('no-results').hidden = visible.size > 0;
    if (updateURL) {
      const url = new URL(location.href);
      fields.forEach(name => filters[name] ? url.searchParams.set(name, filters[name]) : url.searchParams.delete(name));
      history.replaceState(null, '', url);
    }
  }
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('change', () => render());
  document.getElementById('clear-filters').addEventListener('click', () => {
    fields.forEach(name => { form.elements.namedItem(name).value = ''; });
    render();
  });
  window.addEventListener('popstate', () => { readURL(); render(false); });
  readURL();
  render(false);
}
