import './QuoteAnnotationBubble.css';

export default function QuoteAnnotationBubble({
  quote,
  value,
  onChange,
  onSubmit,
  placeholder = 'Write your annotation...',
  buttonLabel = 'Annotate',
  disabled = false,
  textareaId = 'quote-annotation-body',
  actions = null,
  maxLength,
}) {
  function handleChange(event) {
    const nextValue = maxLength
      ? event.target.value.slice(0, maxLength)
      : event.target.value;
    onChange(nextValue);
  }

  return (
    <section className="quote-annotation-bubble" aria-label="Quote annotation">
      <blockquote className="quote-annotation-bubble__quote">
        {quote}
      </blockquote>

      <label className="quote-annotation-bubble__label" htmlFor={textareaId}>
        Annotation
      </label>
      <textarea
        id={textareaId}
        className="quote-annotation-bubble__textarea"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={5}
        maxLength={maxLength}
      />

      <div className="quote-annotation-bubble__actions">
        {maxLength && (
          <span className="quote-annotation-bubble__counter">
            {value.length}/{maxLength}
          </span>
        )}
        {actions || (
          <button
            className="quote-annotation-bubble__button"
            type={onSubmit ? 'button' : 'submit'}
            onClick={onSubmit}
            disabled={disabled}
          >
            {buttonLabel}
          </button>
        )}
      </div>
    </section>
  );
}
