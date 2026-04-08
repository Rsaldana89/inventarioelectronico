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

  function bindQuickCapture(options) {
    if (!options.form || !options.barcode || !options.cantidad) {
      return;
    }

    options.barcode.addEventListener('keydown', function onBarcodeKeydown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        options.cantidad.focus();
        options.cantidad.select();
      }
    });

    options.cantidad.addEventListener('keydown', function onCantidadKeydown(event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (options.returnSearch) {
          options.returnSearch.value = options.barcode.value.trim();
        }
        options.form.submit();
      }
    });

    options.form.addEventListener('submit', function onStoreSubmit() {
      if (options.returnSearch) {
        options.returnSearch.value = options.barcode.value.trim();
      }
    });
  }

  bindQuickCapture({
    form: document.getElementById('storeCaptureForm'),
    barcode: document.getElementById('storeBarcode'),
    cantidad: document.getElementById('storeCantidad'),
    returnSearch: document.getElementById('storeReturnSearch')
  });

  var mobileForm = document.getElementById('mobileCaptureForm');
  var mobileBarcode = document.getElementById('mobileBarcode');
  var mobileCantidad = document.getElementById('mobileCantidad');
  var mobileReturnSearch = document.getElementById('mobileReturnSearch');

  bindQuickCapture({
    form: mobileForm,
    barcode: mobileBarcode,
    cantidad: mobileCantidad,
    returnSearch: mobileReturnSearch
  });

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
});
