document.addEventListener('DOMContentLoaded', function onReady() {
  var autofocus = document.querySelector('[data-autofocus]');
  if (autofocus) {
    autofocus.focus();
    if (typeof autofocus.select === 'function' && autofocus.value) {
      autofocus.select();
    }
  }

  document.querySelectorAll('form[data-confirm]').forEach(function bindConfirm(form) {
    form.addEventListener('submit', function onSubmit(event) {
      var message = form.getAttribute('data-confirm') || '¿Continuar?';
      if (!window.confirm(message)) {
        event.preventDefault();
      }
    });
  });

  function syncExistenciaFields() {
    document.querySelectorAll('[data-origen-select]').forEach(function bindOrigen(origenSelect) {
      var wrapper = origenSelect.closest('form').querySelector('[data-existencia-wrapper]');
      var existenciaSelect = wrapper ? wrapper.querySelector('[data-existencia-select]') : null;
      if (!wrapper || !existenciaSelect) {
        return;
      }

      function applyState() {
        var usesExistencia = origenSelect.value === 'con_existencia' || origenSelect.value === 'con_existencias';
        existenciaSelect.disabled = !usesExistencia;
        existenciaSelect.required = usesExistencia;
        wrapper.classList.toggle('field-disabled', !usesExistencia);
        wrapper.hidden = !usesExistencia;
        if (!usesExistencia) {
          existenciaSelect.value = '';
        }
      }

      origenSelect.addEventListener('change', applyState);
      applyState();
    });
  }

  syncExistenciaFields();

  document.querySelectorAll('[data-password-toggle]').forEach(function bindPasswordToggle(toggleButton) {
    var field = toggleButton.closest('.password-field');
    var input = field ? field.querySelector('[data-password-input]') : null;
    if (!input) {
      return;
    }

    toggleButton.addEventListener('click', function onTogglePassword() {
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggleButton.setAttribute('aria-pressed', visible ? 'false' : 'true');
      toggleButton.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
      toggleButton.innerHTML = visible ? '<span aria-hidden="true">👁</span>' : '<span aria-hidden="true">🙈</span>';
      input.focus();
    });
  });

  var CAPTURE_MODE_KEY = 'inventario_capture_mode';
  var currentCaptureMode = localStorage.getItem(CAPTURE_MODE_KEY) || 'manual';
  if (currentCaptureMode !== 'continuo') {
    currentCaptureMode = 'manual';
  }

  function getCaptureForms() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-capture-mode-form]'));
  }

  function updateCaptureForm(form, mode) {
    var modeInput = form.querySelector('[data-capture-submit-mode]');
    var qtyWrapper = form.querySelector('[data-qty-wrapper]');
    var qtyActions = form.querySelector('[data-qty-actions]');
    var qtyInput = qtyWrapper ? qtyWrapper.querySelector('input[name="cantidad"]') : null;
    var help = form.querySelector('[data-capture-help]');
    var banner = form.querySelector('[data-step-banner]');
    var submitLabel = form.querySelector('[data-capture-submit-label]');
    var buttons = form.querySelectorAll('[data-capture-mode]');

    buttons.forEach(function eachButton(button) {
      var isActive = button.getAttribute('data-capture-mode') === mode;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    if (modeInput) {
      modeInput.value = mode === 'continuo' ? 'sumar' : 'sobrescribir';
    }

    if (qtyInput) {
      if (mode === 'continuo') {
        qtyInput.value = '1';
        qtyInput.readOnly = true;
        qtyInput.required = false;
        qtyInput.tabIndex = -1;
      } else {
        qtyInput.readOnly = false;
        qtyInput.required = true;
        qtyInput.tabIndex = 0;
      }
    }

    if (qtyWrapper) {
      qtyWrapper.classList.toggle('capture-qty-hidden', mode === 'continuo');
    }
    if (qtyActions) {
      qtyActions.classList.toggle('capture-qty-hidden', mode === 'continuo');
    }

    form.classList.toggle('capture-form-continuous', mode === 'continuo');

    if (help) {
      help.textContent = mode === 'continuo'
        ? 'Cada escaneo suma 1 y regresa al campo automáticamente.'
        : 'Escanea, captura cantidad y guarda.';
    }

    if (banner) {
      banner.innerHTML = mode === 'continuo'
        ? '<strong>Modo continuo:</strong> cada escaneo suma 1 y queda listo para el siguiente.'
        : '<strong>Modo manual:</strong> escanea, captura cantidad y guarda.';
    }

    if (submitLabel) {
      submitLabel.textContent = mode === 'continuo' ? 'Escanear y sumar' : 'Guardar registro';
    }
  }

  function applyCaptureMode(mode) {
    currentCaptureMode = mode === 'continuo' ? 'continuo' : 'manual';
    localStorage.setItem(CAPTURE_MODE_KEY, currentCaptureMode);
    getCaptureForms().forEach(function eachForm(form) {
      updateCaptureForm(form, currentCaptureMode);
    });
  }

  function bindCaptureModeButtons() {
    getCaptureForms().forEach(function eachForm(form) {
      form.querySelectorAll('[data-capture-mode]').forEach(function eachButton(button) {
        button.addEventListener('click', function onClick() {
          applyCaptureMode(button.getAttribute('data-capture-mode'));
          var barcodeInput = form.querySelector('input[name="barcode"]');
          if (barcodeInput) {
            barcodeInput.focus();
            if (typeof barcodeInput.select === 'function' && barcodeInput.value) {
              barcodeInput.select();
            }
          }
        });
      });
    });
  }

  function bindQuickCapture(options) {
    if (!options.form || !options.barcode || !options.cantidad) {
      return;
    }

    options.barcode.addEventListener('keydown', function onBarcodeKeydown(event) {
      if (event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      if (currentCaptureMode === 'continuo') {
        options.cantidad.value = '1';
        if (options.returnSearch) {
          options.returnSearch.value = options.barcode.value.trim();
        }
        options.form.requestSubmit ? options.form.requestSubmit() : options.form.submit();
        return;
      }

      options.cantidad.focus();
      options.cantidad.select();
    });

    options.cantidad.addEventListener('keydown', function onCantidadKeydown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (options.returnSearch) {
          options.returnSearch.value = options.barcode.value.trim();
        }
        options.form.requestSubmit ? options.form.requestSubmit() : options.form.submit();
      }
    });

    options.form.addEventListener('submit', function onStoreSubmit() {
      if (options.returnSearch) {
        options.returnSearch.value = options.barcode.value.trim();
      }
      if (currentCaptureMode === 'continuo') {
        options.cantidad.value = '1';
      }
    });
  }

  bindQuickCapture({
    form: document.getElementById('storeCaptureForm'),
    barcode: document.getElementById('storeBarcode'),
    cantidad: document.getElementById('storeCantidad'),
    returnSearch: document.getElementById('storeReturnSearch')
  });

  bindQuickCapture({
    form: document.getElementById('mobileCaptureForm'),
    barcode: document.getElementById('mobileBarcode'),
    cantidad: document.getElementById('mobileCantidad'),
    returnSearch: document.getElementById('mobileReturnSearch')
  });

  var mobileCantidad = document.getElementById('mobileCantidad');
  if (mobileCantidad) {
    document.querySelectorAll('[data-qty-set]').forEach(function onQtyButton(button) {
      button.addEventListener('click', function setQty() {
        mobileCantidad.value = button.getAttribute('data-qty-set') || '1';
        mobileCantidad.focus();
        mobileCantidad.select();
      });
    });

    var mobileQtyFocus = document.querySelector('[data-qty-focus]');
    if (mobileQtyFocus) {
      mobileQtyFocus.addEventListener('click', function focusQty() {
        mobileCantidad.focus();
        mobileCantidad.select();
      });
    }
  }

  bindCaptureModeButtons();
  applyCaptureMode(currentCaptureMode);
});
