import { useState, useEffect } from 'react';
import { authHeaders } from './api/auth';

export function useLookupData() {
  const [sections, setSections] = useState([]);
  const [teams, setTeams] = useState([]);
  const [drinks, setDrinks] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [faculties, setFaculties] = useState([]);

  useEffect(() => {
    const headers = authHeaders();
    Promise.all([
      fetch('/api/sections', { headers }).then((r) => r.json()),
      fetch('/api/teams', { headers }).then((r) => r.json()),
      fetch('/api/drinks', { headers }).then((r) => r.json()),
      fetch('/api/allergies', { headers }).then((r) => r.json()),
      fetch('/api/faculties', { headers }).then((r) => r.json()),
    ]).then(([s, t, d, a, f]) => {
      setSections(s);
      setTeams(t);
      setDrinks(d);
      setAllergies(a);
      setFaculties(f);
    });
  }, []);

  return { sections, teams, drinks, allergies, faculties };
}
