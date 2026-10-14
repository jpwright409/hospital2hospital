# Hospital2Hospital branding

Source: project_sources/H2H Brand Guidelines.docx (owner supplied October 14). Original supplied images remain in public/brand with their original filenames and pixels.

## Assets

- Full Main Logo.png: illustrated brand panel on About Us, displayed without cropping.
- Small Logo.png: shared navigation/footer signature and account-button fallback; existing personal avatars remain visible when present.
- 256bitH2H.ico: copied to src/app/favicon.ico. It contains seven sizes from 16px through 256px.
- Updated src/app/favicon.ico.png: supplied 256px PNG, copied to src/app/apple-icon.png for the touch icon. The original remains intact. Despite its filename, this is PNG content and is not itself a valid .ico file.
- H2Hlogo.ico.png: additional original 256px PNG reference retained in public/brand.

Next.js file-based icon metadata handles favicon/touch links. next/image optimizes the supplied PNG logos and preserves their proportions; no third-party logos or generated replacements were added.

## Palette

| Token | Color | Use |
| --- | --- | --- |
| brand-navy | #073B5B | Headings, navigation, body text |
| brand-teal | #087F91 | Primary actions, interactive branding |
| brand-aqua | #45C9DC | Number 2, featured border, restrained highlights |
| brand-seafoam | #83D9C6 | Decorative accents and light mint tints |
| brand-pale-aqua | #E8F8F8 | Featured/boost surfaces |
| brand-slate | #526B7A | Secondary text and labels |
| brand-off-white | #F7FAFB | Page, header/footer and dashboard surfaces |
| white | #FFFFFF | Cards and forms |

All CSS color values are centralized in the root tokens in src/app/globals.css, including derived borders, hover colors and red/amber operational states. Functional unread/error/destructive red remains distinct from brand accents. Brand gradients are used sparingly for decorative elements and soft featured/seller sections. Bright aqua does not carry small white button text. Darker derived teal (#066879) is used for small text on pale backgrounds; primary filled buttons retain exact Ocean Teal.

Calculated contrast: white on Ocean Teal 4.71:1; navy on cool off-white 11.21:1; slate on white 5.61:1 and on off-white 5.35:1.

## Local review

Desktop Marketplace (1440px), About Us (1280px), and an emulated 390px mobile Marketplace were inspected in headless Chrome using explicit demo mode, without hosted inventory/account operations. Mobile document width matched viewport width and the logo loaded successfully. Screenshots/profiles are in ignored .browser-test-brand. Existing account/inventory permissions and data flows are unchanged. No migration is needed. These local checks do not certify hosted authentication or a production deployment.

## Page and chrome separation

Main page background mixes 35% cool off-white with white for an almost-white surface. Header, top status banner and footer mix 5% navy into cool off-white for a slightly darker blue-gray frame. Both remain derived from the central brand tokens. White cards/forms and their borders remain distinct.
