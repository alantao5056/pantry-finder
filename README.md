# Pantry Finder

Pantry Finder is a community-driven platform designed to bridge the gap between food pantries and people in need. It provides a seamless way to search for local food resources and access real-time information about food availability and schedules.

## Project Overview

This project is managed as a **monorepo**, ensuring a unified workflow for both the frontend and backend services.

- **Website**: A high-performance web application built with **Nuxt 3**, **Tailwind CSS**, and **Nuxt UI**.
- **REST API**: A scalable backend powered by **Node.js** and **Firebase** (Firestore, Auth, and Functions).

## Key Features

- **Nearby Search**: Easily find free food pantries based on your current location.
- **Detailed Pantry Profiles**: Access critical data including:
  - Weekly and daily operating schedules.
  - Specific food distribution time slots.
  - Available food categories (Vegetables, Meat, Canned Goods, Bread, etc.).
- **Community Interaction**: Users can leave reviews, post comments, and express gratitude to the pantries.
- **Responsive Design**: Optimized for both mobile and desktop users.

## Tech Stack

### Frontend
- **Framework**: [Nuxt 3](https://nuxt.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [Nuxt UI](https://ui.nuxt.com/)

### Backend
- **Runtime**: [Node.js](https://nodejs.org/)
- **Database**: [Firebase Firestore](https://firebase.google.com/docs/firestore)
- **Authentication**: [Firebase Auth](https://firebase.google.com/docs/auth)

## Repository Structure

We use a monorepo structure to manage our applications and shared logic efficiently:

```text
/apps
  ├── web/          # Nuxt.js frontend
  └── api/          # Node.js REST API
/packages
  ├── shared/       # Shared TypeScript interfaces and utility functions
  └── config/       # Shared ESLint, Prettier, and TS configurations
```