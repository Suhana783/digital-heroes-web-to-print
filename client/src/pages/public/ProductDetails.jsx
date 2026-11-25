import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { RequestState } from '../../components/ui/RequestState.jsx';
import { formatPrice } from '../../features/catalogue/ProductCard.jsx';
import { useResource } from '../../hooks/useResource.js';
import { apiRequest } from '../../services/api.js';
import { SiteLayout } from '../../components/layout/SiteLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useCart } from '../../context/CartContext.jsx';

function formatMoney(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function ConfigurationGroup({ group, selectedValues, customValue, onSelect, onCustomValue, disabled }) {
  const inputName = `option-${group.id}`;
  return (
    <fieldset className="option-group" disabled={disabled}>
      <legend className="option-group-heading"><span>{group.name}</span><small>{group.is_required ? 'Required' : 'Optional'} · {group.input_type.replaceAll('_', ' ')}</small></legend>
      {group.input_type === 'select' && (
        <select className="config-input" id={inputName} name={inputName} aria-label={group.name} value={selectedValues[0] || ''} onChange={(event) => onSelect(group.id, event.target.value ? [event.target.value] : [])}>
          <option value="">Choose {group.name.toLowerCase()}</option>
          {group.values.map((value) => <option value={value.id} key={value.id}>{value.label} ({adjustmentText(value.price_adjustment, value.adjustment_type)})</option>)}
        </select>
      )}
      {group.input_type === 'multi_select' && (
        <div className="config-choice-list">{group.values.map((value) => (
          <label className="config-choice" key={value.id}><input type="checkbox" aria-label={`${group.name}: ${value.label}`} checked={selectedValues.includes(value.id)} onChange={(event) => onSelect(group.id, event.target.checked ? [...selectedValues, value.id] : selectedValues.filter((id) => id !== value.id))} />
            <span>{value.label}</span><small>{adjustmentText(value.price_adjustment, value.adjustment_type)}</small></label>
        ))}</div>
      )}
      {group.input_type === 'text' && <input className="config-input" id={inputName} aria-label={group.name} type="text" maxLength="1000" value={customValue || ''} onChange={(event) => onCustomValue(group.id, event.target.value)} placeholder={`Enter ${group.name.toLowerCase()}`} />}
      {group.input_type === 'number' && <input className="config-input" id={inputName} aria-label={group.name} type="number" step="any" value={customValue ?? ''} onChange={(event) => onCustomValue(group.id, event.target.value)} placeholder={`Enter ${group.name.toLowerCase()}`} />}
      {group.input_type === 'color' && <div className="color-input-row"><input id={inputName} aria-label={group.name} type="color" value={customValue || '#20231f'} onChange={(event) => onCustomValue(group.id, event.target.value)} /><span>{customValue || 'Choose a color'}</span></div>}
    </fieldset>
  );
}

function adjustmentText(value, type) {
  const amount = Number(value);
  if (!amount) return 'Included';
  return type === 'percentage'
    ? `${amount > 0 ? '+' : ''}${amount}%`
    : `${amount > 0 ? '+' : ''}${formatPrice(amount)}`;
}

function PriceBreakdown({ result }) {
  const selected = useMemo(() => {
    const adjustments = result.option_adjustments.map((adjustment) => ({
      id: adjustment.option_value_id,
      label: `${adjustment.option_group_name}: ${adjustment.label}`,
      before: adjustment.unit_price_before,
      after: adjustment.unit_price_after,
    }));
    const custom = result.custom_inputs.map((input, index) => ({
      id: `${input.option_group_id}-${index}`,
      label: `${input.option_group_name}: ${input.value}`,
      before: null,
      after: null,
    }));
    return [...adjustments, ...custom];
  }, [result]);

  return (
    <section className="price-result" aria-live="polite">
      <p className="eyebrow">PRICE BREAKDOWN</p><h2>{result.product.name}</h2>
      <dl className="price-lines">
        <div><dt>Quantity</dt><dd>{result.quantity} units</dd></div>
        <div><dt>Starting unit price{result.quantity_tier ? ' · quantity tier' : ' · base price'}</dt><dd>{formatMoney(result.starting_unit_price, result.currency)}</dd></div>
        {selected.map((item) => <div key={item.id}><dt>{item.label}{item.before !== null && <small> ({formatMoney(item.before, result.currency)} → {formatMoney(item.after, result.currency)})</small>}</dt><dd>{item.before !== null ? 'Applied' : 'No price change'}</dd></div>)}
        <div className="price-final-unit"><dt>Final price per unit</dt><dd>{formatMoney(result.final_unit_price, result.currency)}</dd></div>
        <div className="price-total"><dt>Total</dt><dd>{formatMoney(result.subtotal, result.currency)}</dd></div>
      </dl>
      <p className="tier-note">Custom text, number, and color inputs are recorded for configuration only and do not change this price.</p>
    </section>
  );
}

export default function ProductDetails() {
  const { divisionSlug, productSlug } = useParams();
  const { user } = useAuth();
  const cart = useCart();
  const { data, loading, error, retry } = useResource(
    (signal) => apiRequest(`/catalogue/divisions/${encodeURIComponent(divisionSlug)}/products/${encodeURIComponent(productSlug)}`, { signal }),
    [divisionSlug, productSlug],
  );
  const [selectedValues, setSelectedValues] = useState({});
  const [customValues, setCustomValues] = useState({});
  const [quantity, setQuantity] = useState('1');
  const [calculation, setCalculation] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [calculationError, setCalculationError] = useState('');
  const [isOutdated, setIsOutdated] = useState(false);
  const [cartMessage, setCartMessage] = useState('');

  useEffect(() => {
    setSelectedValues({}); setCustomValues({}); setQuantity('1');
    setCalculation(null); setCalculationError(''); setIsOutdated(false);
  }, [data?.id]);

  function markChanged() {
    if (calculation) setIsOutdated(true);
    setCalculationError('');
  }

  function updateSelection(groupId, ids) {
    markChanged();
    setCartMessage('');
    setSelectedValues((current) => ({ ...current, [groupId]: ids }));
  }

  function updateCustomValue(groupId, value) {
    markChanged();
    setCartMessage('');
    setCustomValues((current) => ({ ...current, [groupId]: value }));
  }

  async function submitCalculation(event) {
    event.preventDefault();
    setCalculation(null); setCalculationError(''); setIsOutdated(false);
    const amount = Number(quantity);
    if (!Number.isInteger(amount) || amount < 1) {
      setCalculationError('Enter a positive whole-number quantity.');
      return;
    }
    if (amount > 2_147_483_647) {
      setCalculationError('Quantity is above the supported maximum.');
      return;
    }
    const missingRequired = data.option_groups.find((group) => {
      if (!group.is_required) return false;
      if (group.input_type === 'select' || group.input_type === 'multi_select') return !(selectedValues[group.id] || []).length;
      const value = customValues[group.id];
      return value === undefined || value === '' || (typeof value === 'string' && !value.trim());
    });
    if (missingRequired) {
      setCalculationError(`${missingRequired.name} is required.`);
      return;
    }
    const invalidCustom = data.option_groups.find((group) => {
      const value = customValues[group.id];
      if (value === undefined || value === '') return false;
      if (group.input_type === 'number') return !Number.isFinite(Number(value));
      if (group.input_type === 'text') return value.length > 1000;
      if (group.input_type === 'color') return !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(value);
      return false;
    });
    if (invalidCustom) {
      setCalculationError(`Check the value entered for ${invalidCustom.name}.`);
      return;
    }
    const selectedOptions = data.option_groups
      .filter((group) => ['select', 'multi_select'].includes(group.input_type) && (selectedValues[group.id] || []).length)
      .map((group) => ({ optionGroupId: group.id, optionValueIds: selectedValues[group.id] }));
    const customInputs = data.option_groups
      .filter((group) => ['text', 'number', 'color'].includes(group.input_type) && customValues[group.id] !== undefined && customValues[group.id] !== '')
      .map((group) => ({ optionGroupId: group.id, value: group.input_type === 'number' ? Number(customValues[group.id]) : customValues[group.id] }));
    setCalculating(true);
    try {
      const result = await apiRequest('/pricing/calculate', {
        method: 'POST',
        body: { productId: data.id, quantity: amount, selectedOptions, customInputs },
      });
      setCalculation(result); setIsOutdated(false);
    } catch (requestError) {
      setCalculationError(requestError.message);
    } finally {
      setCalculating(false);
    }
  }

  function addConfiguredProduct() {
    if (!data || !calculation || isOutdated) return;
    cart.addItem({
      productId: data.id,
      divisionSlug,
      productSlug,
      quantity: Number(quantity),
      selectedOptions: data.option_groups
        .filter((group) => ['select', 'multi_select'].includes(group.input_type) && (selectedValues[group.id] || []).length)
        .map((group) => ({ optionGroupId: group.id, optionValueIds: selectedValues[group.id] })),
      customInputs: data.option_groups
        .filter((group) => ['text', 'number', 'color'].includes(group.input_type) && customValues[group.id] !== undefined && customValues[group.id] !== '')
        .map((group) => ({ optionGroupId: group.id, value: group.input_type === 'number' ? Number(customValues[group.id]) : customValues[group.id] })),
    });
    setCartMessage('Added to your cart. Prices will be refreshed before checkout.');
  }

  return (
    <SiteLayout>
      <main className="catalogue-page page-gutter">
        <Link className="back-link" to={`/catalogue/${divisionSlug}`}>← Back to {divisionSlug.replaceAll('-', ' ')}</Link>
        <RequestState loading={loading} error={error} onRetry={retry}>
          {data && <>
            <div className="product-detail-heading">
              <div><p className="eyebrow">{data.division.name.toUpperCase()} / PRODUCT DETAILS</p><h1>{data.name}</h1><p>{data.description || 'No product description is available.'}</p></div>
              <div className="starting-price"><span className="state-kicker">BASE PRICE / UNIT</span><strong>{formatPrice(data.base_price)}</strong></div>
            </div>
            <div className="product-designer-link"><span>Want to lay out your artwork?</span><Link className="text-link" to={user ? `/account/designer?productId=${encodeURIComponent(data.id)}` : '/login'}>Open browser designer <span>↗</span></Link></div>
            <div className="configuration-layout">
              <form className="configuration-panel" onSubmit={submitCalculation}>
                <div className="catalogue-subheading"><h2>Configure your product</h2></div>
                {data.option_groups.length ? data.option_groups.map((group) => (
                  <ConfigurationGroup key={group.id} group={group}
                    selectedValues={selectedValues[group.id] || []} customValue={customValues[group.id]}
                    onSelect={updateSelection} onCustomValue={updateCustomValue} disabled={calculating} />
                )) : <p className="subtle-copy">This product has no configurable options.</p>}
                <label className="quantity-field" htmlFor="quantity"><span>Quantity <b>Required</b></span><input className="config-input" id="quantity" type="number" min="1" step="1" value={quantity} disabled={calculating} onChange={(event) => { markChanged(); setQuantity(event.target.value); }} /></label>
                {calculationError && <p className="calculation-error" role="alert">{calculationError}</p>}
                {isOutdated && <p className="calculation-outdated" role="status">Your selection changed. Recalculate to refresh the price.</p>}
                <button className="calculate-button" type="submit" disabled={calculating}>{calculating ? 'Calculating…' : 'Calculate price'} <span aria-hidden="true">↗</span></button>
                {user ? <button className="add-cart-button" type="button" onClick={addConfiguredProduct} disabled={!cart.ready || !calculation || isOutdated || calculating}>Add configured product to cart <span>＋</span></button> : <Link className="add-cart-button" to="/login">Sign in to add this product to your cart <span>↗</span></Link>}
                {cartMessage && <p className="form-message success" role="status">{cartMessage} <Link to="/cart">View cart</Link></p>}
              </form>
              <aside className="pricing-aside">
                {calculation && !isOutdated ? <PriceBreakdown result={calculation} /> : <div className="price-prompt"><p className="eyebrow">{isOutdated ? 'PRICE NEEDS UPDATE' : 'LIVE PRICE'}</p><h2>{isOutdated ? 'Recalculate your selection.' : 'Make it yours.'}</h2><p>{isOutdated ? 'The configuration changed, so the previous total is hidden until a fresh calculation succeeds.' : 'Choose the available options and quantity to see a price breakdown calculated from the current catalogue.'}</p></div>}
              </aside>
            </div>
          </>}
        </RequestState>
      </main>
    </SiteLayout>
  );
}
