import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 40,
          background: 'linear-gradient(45deg, #4f46e5 0%, #8b5cf6 100%)',
          color: '#ffffff',
          fontSize: 84,
          fontWeight: 800,
          letterSpacing: '-2px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        TA
      </div>
    ),
    { ...size }
  );
}
