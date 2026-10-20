const messages = {
  EXPIRED: [
    'The printed expiry has passed. Do not accept this item.',
    'पैक की समाप्ति तिथि बीत चुकी है। स्वीकार न करें।',
  ],
  BELOW_MIN_SHELF_LIFE: [
    'Remaining shelf life is below the configured delivery threshold.',
    'शेष शेल्फ लाइफ निर्धारित सीमा से कम है।',
  ],
  EXPIRY_NOT_READ: [
    'The expiry date could not be read. Ask a supervisor.',
    'समाप्ति तिथि पढ़ी नहीं जा सकी। पर्यवेक्षक से जाँच कराएँ।',
  ],
  TWO_SIGNALS_REQUIRED: [
    'Two independent date signals have not agreed. Supervisor review required.',
    'तारीख के दो स्वतंत्र संकेत मेल नहीं खाते। पर्यवेक्षक की जाँच आवश्यक है।',
  ],
  MFG_UNKNOWN_PERCENT_NOT_CHECKED: [
    'Manufacture date is missing; shelf-life percentage is unknown.',
    'निर्माण तिथि उपलब्ध नहीं है; शेल्फ लाइफ प्रतिशत अज्ञात है।',
  ],
  MFG_AFTER_EXP_CHECK_LABEL: [
    'The manufacture date is invalid or in the future. Recheck the label.',
    'निर्माण तिथि अमान्य है या भविष्य की है। लेबल जाँचें।',
  ],
  LICENCE_NOT_READ: [
    'A readable 14-digit FSSAI licence number is required.',
    'पढ़ने योग्य 14-अंकीय FSSAI लाइसेंस संख्या आवश्यक है।',
  ],
  MRP_NOT_READ: [
    'MRP is unreadable. Confirm the printed price.',
    'MRP पढ़ी नहीं जा सकी। प्रिंट की गई कीमत जाँचें।',
  ],
  UNKNOWN_PRODUCT: [
    'This barcode needs a catalog entry before acceptance.',
    'स्वीकार करने से पहले इस बारकोड को कैटलॉग में जोड़ें।',
  ],
  NEAR_THRESHOLD: [
    'This lot is close to the configured shelf-life threshold.',
    'यह लॉट निर्धारित शेल्फ लाइफ सीमा के पास है।',
  ],
  PROVIDER_UNCONFIGURED: [
    'Vision provider is not configured. Continue with manual supervisor review.',
    'विज़न सेवा उपलब्ध नहीं है। पर्यवेक्षक से मैनुअल जाँच कराएँ।',
  ],
  PROVIDER_FAILED: [
    'Photo analysis failed. Keep this item under human review.',
    'फोटो विश्लेषण विफल रहा। मैनुअल जाँच आवश्यक है।',
  ],
  CIRCUIT_OPEN: [
    'Photo analysis is temporarily unavailable. Try manual review.',
    'फोटो विश्लेषण अस्थायी रूप से अनुपलब्ध है। मैनुअल जाँच करें।',
  ],
};
export function reasonText(code, language = 'en') {
  return (
    messages[code]?.[language === 'hi' ? 1 : 0] ||
    code.replaceAll('_', ' ').toLowerCase()
  );
}
