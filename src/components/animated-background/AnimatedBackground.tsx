
import React, { useEffect, useRef } from 'react';
import './animated-background.scss';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  opacity: number;
  hue: number;
}

export const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize particles
    const createParticles = () => {
      const particles: Particle[] = [];
      const particleCount = Math.min(150, Math.floor((canvas.width * canvas.height) / 8000));
      
      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 4 + 2,
          opacity: Math.random() * 0.6 + 0.2,
          hue: 0, // White particles
        });
      }
      return particles;
    };

    particlesRef.current = createParticles();

    const animate = (time: number) => {
      ctx.fillStyle = 'rgba(23, 23, 23, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Create gradient background with network theme
      const gradient = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 0,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
      );
      gradient.addColorStop(0, 'rgba(15, 25, 15, 0.9)');
      gradient.addColorStop(0.5, 'rgba(10, 15, 10, 0.95)');
      gradient.addColorStop(1, 'rgba(5, 10, 5, 1)');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Animate particles
      particlesRef.current.forEach((particle, index) => {
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;

        // Wrap around edges
        if (particle.x < 0) particle.x = canvas.width;
        if (particle.x > canvas.width) particle.x = 0;
        if (particle.y < 0) particle.y = canvas.height;
        if (particle.y > canvas.height) particle.y = 0;

        // Animate opacity
        particle.opacity = 0.1 + 0.4 * (Math.sin(time * 0.001 + index * 0.1) + 1) / 2;

        // Draw network node with glow effect
        const nodeGradient = ctx.createRadialGradient(
          particle.x, particle.y, 0,
          particle.x, particle.y, particle.size * 2
        );
        nodeGradient.addColorStop(0, `rgba(255, 255, 255, ${particle.opacity})`);
        nodeGradient.addColorStop(0.5, `rgba(255, 255, 255, ${particle.opacity * 0.6})`);
        nodeGradient.addColorStop(1, `rgba(255, 255, 255, 0)`);
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 2, 0, Math.PI * 2);
        ctx.fillStyle = nodeGradient;
        ctx.fill();
        
        // Draw core node
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${particle.opacity})`;
        ctx.fill();

        // Draw connections between nearby particles
        particlesRef.current.forEach((otherParticle, otherIndex) => {
          if (index >= otherIndex) return;
          
          const dx = particle.x - otherParticle.x;
          const dy = particle.y - otherParticle.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 120) {
            const opacity = (120 - distance) / 120 * 0.4;
            const pulsePhase = Math.sin(time * 0.002 + distance * 0.01) * 0.3 + 0.7;
            
            // Draw data flow line
            ctx.beginPath();
            ctx.moveTo(particle.x, particle.y);
            ctx.lineTo(otherParticle.x, otherParticle.y);
            ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * pulsePhase})`;
            ctx.lineWidth = Math.max(1, opacity * 3);
            ctx.stroke();
            
            // Add data packet animation
            if (distance < 80 && Math.random() < 0.02) {
              const progress = (Math.sin(time * 0.005 + distance) + 1) / 2;
              const packetX = particle.x + (otherParticle.x - particle.x) * progress;
              const packetY = particle.y + (otherParticle.y - particle.y) * progress;
              
              ctx.beginPath();
              ctx.arc(packetX, packetY, 2, 0, Math.PI * 2);
              ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
              ctx.fill();
            }
          }
        });
      });

      

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="animated-background-container">
      <canvas
        ref={canvasRef}
        className="animated-background"
      />
      <div className="background-text">
        <span className="letter-white">BlackAI </span>
        <span className="letter-white">⚛</span>
      </div>
    </div>
  );
};
